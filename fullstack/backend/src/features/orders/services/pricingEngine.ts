import type {
  ListingPriceRecord,
  PricingQuote,
  PricingRuleType,
  PricingRuleVersionRecord
} from '../types';

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const buildPricingQuote = (params: {
  cycleId: number;
  pickupPointId: number;
  taxJurisdiction: {
    id: number;
    code: string;
    taxRate: number;
  };
  listingRecords: ListingPriceRecord[];
  items: Array<{ listingId: number; quantity: number }>;
  ruleVersions: PricingRuleVersionRecord[];
}): PricingQuote => {
  const listingMap = new Map(params.listingRecords.map((record) => [record.listingId, record]));

  const lines = params.items.map((item) => {
    const record = listingMap.get(item.listingId);
    if (!record) {
      throw new Error(`Listing ${item.listingId} not available for pricing.`);
    }

    const quantity = item.quantity;
    const unitPrice = record.unitPrice;

    let subtotal = roundMoney(unitPrice * quantity);
    let memberPricingAdjustment = 0;
    let tieredDiscount = 0;
    let cappedDiscount = 0;
    let subsidy = 0;

    const appliedRules: Array<{
      code: string;
      ruleType: PricingRuleType;
      value: number;
      details: Record<string, unknown>;
    }> = [];

    for (const rule of params.ruleVersions) {
      if (rule.ruleType === 'MEMBER_PRICING' && rule.config.memberUnitPrice !== undefined) {
        const targetSubtotal = roundMoney(rule.config.memberUnitPrice * quantity);
        const adjustment = roundMoney(subtotal - targetSubtotal);
        if (adjustment > 0) {
          memberPricingAdjustment += adjustment;
          subtotal = targetSubtotal;
          appliedRules.push({
            code: rule.code,
            ruleType: rule.ruleType,
            value: adjustment,
            details: { memberUnitPrice: rule.config.memberUnitPrice }
          });
        }
      }

      if (rule.ruleType === 'TIERED_DISCOUNT') {
        const minQuantity = Number(rule.config.minQuantity ?? 0);
        const percent = Number(rule.config.percent ?? 0);
        if (quantity >= minQuantity && percent > 0) {
          const discount = roundMoney(subtotal * percent);
          tieredDiscount += discount;
          appliedRules.push({
            code: rule.code,
            ruleType: rule.ruleType,
            value: discount,
            details: { minQuantity, percent }
          });
        }
      }

      if (rule.ruleType === 'CAPPED_DISCOUNT') {
        const percent = Number(rule.config.percent ?? 0);
        const maxDiscount = Number(rule.config.maxDiscount ?? 0);
        if (percent > 0 && maxDiscount > 0) {
          const discount = Math.min(roundMoney(subtotal * percent), maxDiscount);
          cappedDiscount += roundMoney(discount);
          appliedRules.push({
            code: rule.code,
            ruleType: rule.ruleType,
            value: roundMoney(discount),
            details: { percent, maxDiscount }
          });
        }
      }

      if (rule.ruleType === 'SUBSIDY') {
        const subsidyPerUnit = Number(rule.config.subsidyPerUnit ?? 0);
        if (subsidyPerUnit > 0) {
          const subsidyAmount = roundMoney(subsidyPerUnit * quantity);
          subsidy += subsidyAmount;
          appliedRules.push({
            code: rule.code,
            ruleType: rule.ruleType,
            value: subsidyAmount,
            details: { subsidyPerUnit }
          });
        }
      }
    }

    const taxableBase = roundMoney(Math.max(subtotal - tieredDiscount - cappedDiscount, 0));
    const taxAmount = roundMoney(taxableBase * params.taxJurisdiction.taxRate);
    const total = roundMoney(taxableBase + taxAmount - subsidy);

    return {
      listingId: record.listingId,
      title: record.title,
      quantity,
      unitPrice,
      subtotal,
      memberPricingAdjustment: roundMoney(memberPricingAdjustment),
      tieredDiscount: roundMoney(tieredDiscount),
      cappedDiscount: roundMoney(cappedDiscount),
      subsidy: roundMoney(subsidy),
      taxableBase,
      taxAmount,
      total,
      appliedRules
    };
  });

  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const discountTotal = roundMoney(
    lines.reduce(
      (sum, line) =>
        sum + line.memberPricingAdjustment + line.tieredDiscount + line.cappedDiscount,
      0
    )
  );
  const subsidyTotal = roundMoney(lines.reduce((sum, line) => sum + line.subsidy, 0));
  const taxTotal = roundMoney(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const grandTotal = roundMoney(lines.reduce((sum, line) => sum + line.total, 0));

  return {
    cycleId: params.cycleId,
    pickupPointId: params.pickupPointId,
    taxJurisdiction: {
      id: params.taxJurisdiction.id,
      code: params.taxJurisdiction.code,
      rate: params.taxJurisdiction.taxRate
    },
    lineItems: lines,
    subtotal,
    discountTotal,
    subsidyTotal,
    taxTotal,
    grandTotal,
    trace: {
      generatedAt: new Date().toISOString(),
      rulesApplied: params.ruleVersions.map((rule) => ({
        code: rule.code,
        ruleType: rule.ruleType,
        config: rule.config,
        versionId: rule.id
      }))
    }
  };
};