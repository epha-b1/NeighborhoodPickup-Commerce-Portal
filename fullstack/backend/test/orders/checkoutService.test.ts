import * as repository from '../../src/features/orders/data/orderRepository';
import { checkoutOrder } from '../../src/features/orders/services/orderService';

vi.mock('../../src/features/orders/data/orderRepository');

const repo = vi.mocked(repository);

describe('checkout service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns capacity conflict with alternatives when window is full', async () => {
    repo.getTaxJurisdictionByCode.mockResolvedValue({
      id: 1,
      code: 'US-IL-SPRINGFIELD',
      taxRate: 0.0825
    });
    repo.getListingPricingRecords.mockResolvedValue([
      {
        listingId: 1,
        title: 'Kale',
        unitPrice: 5,
        availableQuantity: 20,
        reservedQuantity: 0
      }
    ]);
    repo.getActivePricingRuleVersions.mockResolvedValue([]);
    repo.getPickupWindowCapacity.mockResolvedValue({
      id: 5,
      pickupPointId: 2,
      windowDate: '2026-03-27',
      startTime: '09:00:00',
      endTime: '11:00:00',
      capacityTotal: 10,
      reservedSlots: 10
    });
    repo.listAlternativePickupWindows.mockResolvedValue([
      {
        pickupWindowId: 6,
        windowDate: '2026-03-27',
        startTime: '11:00:00',
        endTime: '13:00:00',
        remainingCapacity: 2
      }
    ]);

    const result = await checkoutOrder({
      userId: 8,
      input: {
        cycleId: 3,
        pickupPointId: 2,
        pickupWindowId: 5,
        taxJurisdictionCode: 'US-IL-SPRINGFIELD',
        items: [{ listingId: 1, quantity: 2 }]
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected failure result');
    }
    expect(result.code).toBe('CAPACITY_EXCEEDED');
    expect(result.conflict?.alternatives).toHaveLength(1);
  });

  it('creates confirmed order when capacity and inventory allow', async () => {
    repo.getTaxJurisdictionByCode.mockResolvedValue({
      id: 1,
      code: 'US-IL-SPRINGFIELD',
      taxRate: 0.0825
    });
    repo.getListingPricingRecords.mockResolvedValue([
      {
        listingId: 1,
        title: 'Kale',
        unitPrice: 5,
        availableQuantity: 20,
        reservedQuantity: 0
      }
    ]);
    repo.getActivePricingRuleVersions.mockResolvedValue([]);
    repo.getPickupWindowCapacity.mockResolvedValue({
      id: 5,
      pickupPointId: 2,
      windowDate: '2026-03-27',
      startTime: '09:00:00',
      endTime: '11:00:00',
      capacityTotal: 10,
      reservedSlots: 3
    });
    repo.createOrderTransaction.mockResolvedValue({ orderId: 77, settlementId: 501 });

    const result = await checkoutOrder({
      userId: 8,
      input: {
        cycleId: 3,
        pickupPointId: 2,
        pickupWindowId: 5,
        taxJurisdictionCode: 'US-IL-SPRINGFIELD',
        items: [{ listingId: 1, quantity: 2 }]
      }
    });

    expect(result).toEqual({
      ok: true,
      orderId: 77,
      status: 'CONFIRMED'
    });
    expect(repo.createOrderTransaction).toHaveBeenCalled();
  });

  it('returns inventory error when repository throws inventory depletion', async () => {
    repo.getTaxJurisdictionByCode.mockResolvedValue({
      id: 1,
      code: 'US-IL-SPRINGFIELD',
      taxRate: 0.0825
    });
    repo.getListingPricingRecords.mockResolvedValue([
      {
        listingId: 1,
        title: 'Kale',
        unitPrice: 5,
        availableQuantity: 20,
        reservedQuantity: 0
      }
    ]);
    repo.getActivePricingRuleVersions.mockResolvedValue([]);
    repo.getPickupWindowCapacity.mockResolvedValue({
      id: 5,
      pickupPointId: 2,
      windowDate: '2026-03-27',
      startTime: '09:00:00',
      endTime: '11:00:00',
      capacityTotal: 10,
      reservedSlots: 3
    });
    repo.createOrderTransaction.mockRejectedValue(new Error('INSUFFICIENT_INVENTORY:1'));

    const result = await checkoutOrder({
      userId: 8,
      input: {
        cycleId: 3,
        pickupPointId: 2,
        pickupWindowId: 5,
        taxJurisdictionCode: 'US-IL-SPRINGFIELD',
        items: [{ listingId: 1, quantity: 2 }]
      }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INSUFFICIENT_INVENTORY');
    }
  });
});