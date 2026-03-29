import {
  getTaxJurisdictionByCode,
  getActivePricingRuleVersions,
  getListingPricingRecords,
  getPickupWindowCapacity,
  listAlternativePickupWindows,
  createOrderTransaction,
  getOrderDetailById,
  getLedgerRows
} from '../data/orderRepository';
import { buildPricingQuote } from './pricingEngine';
import type { CheckoutResult, OrderDetail, OrderQuoteInput, PricingQuote } from '../types';
import { recordServerBehaviorEvent } from "../../behavior/services/behaviorService";

const normalizeOrderItems = (
  items: OrderQuoteInput['items']
): Array<{ listingId: number; quantity: number }> => {
  const map = new Map<number, number>();

  for (const item of items) {
    const existing = map.get(item.listingId) ?? 0;
    map.set(item.listingId, existing + item.quantity);
  }

  return Array.from(map.entries()).map(([listingId, quantity]) => ({ listingId, quantity }));
};

const validateItems = (items: OrderQuoteInput['items']): void => {
  if (items.length === 0) {
    throw new Error('INVALID_ORDER_ITEMS');
  }

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('INVALID_ORDER_ITEMS');
    }
  }
};

export const quoteOrder = async (input: OrderQuoteInput): Promise<PricingQuote> => {
  validateItems(input.items);

  const taxJurisdiction = await getTaxJurisdictionByCode(input.taxJurisdictionCode);
  if (!taxJurisdiction) {
    throw new Error('INVALID_TAX_JURISDICTION');
  }

  const normalizedItems = normalizeOrderItems(input.items);

  const listingRecords = await getListingPricingRecords({
    cycleId: input.cycleId,
    pickupPointId: input.pickupPointId,
    items: normalizedItems
  });

  if (listingRecords.length !== normalizedItems.length) {
    throw new Error('INVALID_ORDER_LISTING_SELECTION');
  }

  const listingMap = new Map(listingRecords.map((record) => [record.listingId, record]));

  for (const item of normalizedItems) {
    const listing = listingMap.get(item.listingId)!;
    const available = listing.availableQuantity - listing.reservedQuantity;
    if (available < item.quantity) {
      throw new Error(`INSUFFICIENT_INVENTORY:${item.listingId}`);
    }
  }

  const pickupWindow = await getPickupWindowCapacity(input.pickupWindowId);
  if (!pickupWindow || pickupWindow.pickupPointId !== input.pickupPointId) {
    throw new Error('INVALID_PICKUP_WINDOW');
  }

  const ruleVersions = await getActivePricingRuleVersions();

  return buildPricingQuote({
    cycleId: input.cycleId,
    pickupPointId: input.pickupPointId,
    taxJurisdiction,
    listingRecords,
    items: normalizedItems,
    ruleVersions
  });
};

export const checkoutOrder = async (params: {
  userId: number;
  input: OrderQuoteInput;
}): Promise<CheckoutResult> => {
  try {
    const quote = await quoteOrder(params.input);

    const pickupWindow = await getPickupWindowCapacity(params.input.pickupWindowId);
    if (!pickupWindow || pickupWindow.pickupPointId !== params.input.pickupPointId) {
      return {
        ok: false,
        code: 'INVALID_ORDER',
        message: 'Invalid pickup window selection.'
      };
    }

    const remainingCapacity = pickupWindow.capacityTotal - pickupWindow.reservedSlots;
    if (remainingCapacity < 1) {
      const alternatives = await listAlternativePickupWindows({
        pickupPointId: params.input.pickupPointId,
        minimumRemaining: 1,
        excludeWindowId: params.input.pickupWindowId,
        limit: 5
      });
      return {
        ok: false,
        code: 'CAPACITY_EXCEEDED',
        message: 'Selected pickup window has reached full capacity.',
        conflict: {
          message: 'Selected pickup window is full. Choose another window.',
          requestedWindowId: params.input.pickupWindowId,
          alternatives
        }
      };
    }

    const persisted = await createOrderTransaction({
      userId: params.userId,
      cycleId: params.input.cycleId,
      pickupPointId: params.input.pickupPointId,
      taxJurisdictionId: quote.taxJurisdiction.id,
      pickupWindow: {
        id: pickupWindow.id,
        windowDate: pickupWindow.windowDate,
        startTime: pickupWindow.startTime,
        endTime: pickupWindow.endTime
      },
      quote: {
        subtotal: quote.subtotal,
        discountTotal: quote.discountTotal,
        subsidyTotal: quote.subsidyTotal,
        taxTotal: quote.taxTotal,
        grandTotal: quote.grandTotal,
        trace: quote,
        lineItems: quote.lineItems.map((line) => ({
          listingId: line.listingId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          lineDiscount: line.memberPricingAdjustment + line.tieredDiscount + line.cappedDiscount,
          lineSubsidy: line.subsidy,
          lineTax: line.taxAmount,
          lineTotal: line.total,
          pricingBreakdown: line
        }))
      }
    });

    return {
      ok: true,
      orderId: persisted.orderId,
      status: 'CONFIRMED'
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('INSUFFICIENT_INVENTORY:')) {
      return {
        ok: false,
        code: 'INSUFFICIENT_INVENTORY',
        message: 'One or more items no longer have enough inventory.'
      };
    }

    if (error instanceof Error && error.message === 'CAPACITY_EXCEEDED') {
      const alternatives = await listAlternativePickupWindows({
        pickupPointId: params.input.pickupPointId,
        minimumRemaining: 1,
        excludeWindowId: params.input.pickupWindowId,
        limit: 5
      });

      return {
        ok: false,
        code: 'CAPACITY_EXCEEDED',
        message: 'Selected pickup window has reached full capacity.',
        conflict: {
          message: 'Selected pickup window is full. Choose another window.',
          requestedWindowId: params.input.pickupWindowId,
          alternatives
        }
      };
    }

    return {
      ok: false,
      code: 'INVALID_ORDER',
      message: error instanceof Error ? error.message : 'Failed to submit order.'
    };
  }
};

export const getOrderById = async (params: {
  orderId: number;
  userId: number;
  roles: string[];
}): Promise<OrderDetail | null> => {
  const order = await getOrderDetailById(params);

  if (order) {
    await recordServerBehaviorEvent({
      userId: params.userId,
      eventType: "IMPRESSION",
      resourceType: "ORDER_DETAIL",
      resourceId: String(params.orderId)
    });
  }

  return order;
};

export const getLedger = async () => {
  return getLedgerRows();
};
