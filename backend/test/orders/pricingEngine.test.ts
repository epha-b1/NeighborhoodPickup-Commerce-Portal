import { buildPricingQuote } from '../../src/features/orders/services/pricingEngine';

describe('pricing engine', () => {
  it('applies member pricing, tiered discount, capped discount, subsidy, and tax traceably', () => {
    const quote = buildPricingQuote({
      cycleId: 1,
      pickupPointId: 2,
      taxJurisdiction: {
        id: 1,
        code: 'US-IL-SPRINGFIELD',
        taxRate: 0.0825
      },
      listingRecords: [
        {
          listingId: 10,
          title: 'Organic Kale Bundle',
          unitPrice: 6.49,
          availableQuantity: 100,
          reservedQuantity: 10
        }
      ],
      items: [
        {
          listingId: 10,
          quantity: 4
        }
      ],
      ruleVersions: [
        {
          id: 101,
          pricingRuleId: 1,
          code: 'MEMBER_PRICE_PROMO',
          name: 'Member price adjustment',
          ruleType: 'MEMBER_PRICING',
          config: { memberUnitPrice: 5.99 }
        },
        {
          id: 102,
          pricingRuleId: 2,
          code: 'TIER_QTY_3',
          name: 'Tiered discount',
          ruleType: 'TIERED_DISCOUNT',
          config: { minQuantity: 3, percent: 0.05 }
        },
        {
          id: 103,
          pricingRuleId: 3,
          code: 'CAP_10_PERCENT',
          name: 'Capped discount',
          ruleType: 'CAPPED_DISCOUNT',
          config: { percent: 0.1, maxDiscount: 2.0 }
        },
        {
          id: 104,
          pricingRuleId: 4,
          code: 'SUBSIDY_LOCAL',
          name: 'Subsidy',
          ruleType: 'SUBSIDY',
          config: { subsidyPerUnit: 0.25 }
        }
      ]
    });

    expect(quote.lineItems).toHaveLength(1);
    const line = quote.lineItems[0];

    expect(line.memberPricingAdjustment).toBeGreaterThan(0);
    expect(line.tieredDiscount).toBeGreaterThan(0);
    expect(line.cappedDiscount).toBeGreaterThan(0);
    expect(line.subsidy).toBe(1);
    expect(line.taxAmount).toBeGreaterThan(0);
    expect(line.appliedRules.length).toBe(4);
    expect(quote.trace.rulesApplied.length).toBe(4);
    expect(quote.grandTotal).toBeCloseTo(line.total, 2);
  });

  it('keeps tax at zero when tax rate is zero', () => {
    const quote = buildPricingQuote({
      cycleId: 1,
      pickupPointId: 1,
      taxJurisdiction: {
        id: 2,
        code: 'ZERO-TAX',
        taxRate: 0
      },
      listingRecords: [
        {
          listingId: 2,
          title: 'Eggs',
          unitPrice: 4,
          availableQuantity: 100,
          reservedQuantity: 0
        }
      ],
      items: [
        {
          listingId: 2,
          quantity: 2
        }
      ],
      ruleVersions: []
    });

    expect(quote.taxTotal).toBe(0);
    expect(quote.lineItems[0].taxAmount).toBe(0);
  });
});