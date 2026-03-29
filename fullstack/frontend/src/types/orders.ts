export type PricingRuleType = 'TIERED_DISCOUNT' | 'CAPPED_DISCOUNT' | 'MEMBER_PRICING' | 'SUBSIDY';

export type PricingLineBreakdown = {
  listingId: number;
  title: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  memberPricingAdjustment: number;
  tieredDiscount: number;
  cappedDiscount: number;
  subsidy: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
  appliedRules: Array<{
    code: string;
    ruleType: PricingRuleType;
    value: number;
    details: Record<string, unknown>;
  }>;
};

export type OrderQuote = {
  cycleId: number;
  pickupPointId: number;
  taxJurisdiction: {
    id: number;
    code: string;
    rate: number;
  };
  lineItems: PricingLineBreakdown[];
  subtotal: number;
  discountTotal: number;
  subsidyTotal: number;
  taxTotal: number;
  grandTotal: number;
  trace: {
    generatedAt: string;
    rulesApplied: Array<{
      code: string;
      ruleType: PricingRuleType;
      config: Record<string, unknown>;
      versionId: number;
    }>;
  };
};

export type CheckoutResponse =
  | {
      ok: true;
      orderId: number;
      status: 'CONFIRMED';
    }
  | {
      ok: false;
      code: 'CAPACITY_EXCEEDED' | 'INSUFFICIENT_INVENTORY' | 'INVALID_ORDER';
      message: string;
      conflict?: {
        message: string;
        requestedWindowId: number;
        alternatives: Array<{
          pickupWindowId: number;
          windowDate: string;
          startTime: string;
          endTime: string;
          remainingCapacity: number;
        }>;
      };
    };

export type OrderDetail = {
  id: number;
  userId: number;
  cycleId: number;
  pickupPointId: number;
  status: string;
  pickupWindow: {
    pickupWindowId: number;
    date: string;
    startTime: string;
    endTime: string;
  };
  totals: {
    subtotal: number;
    discount: number;
    subsidy: number;
    tax: number;
    total: number;
  };
  pricingTrace: unknown;
  items: Array<{
    listingId: number;
    quantity: number;
    unitPrice: number;
    lineSubtotal: number;
    lineDiscount: number;
    lineSubsidy: number;
    lineTax: number;
    lineTotal: number;
    pricingBreakdown: unknown;
  }>;
};

export type LedgerRow = {
  id: number;
  orderId: number;
  settlementId: number;
  accountCode: string;
  accountName: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
  memo: string | null;
  createdAt: string;
};