import {
  createReconciliationExportJob,
  createWithdrawal,
  deleteBlacklistEntry,
  getLeaderCommissionRate,
  getOrderCommissionBases,
  getSettlementRowsForExport,
  getWithdrawalWindowUsage,
  isLeaderBlacklisted,
  listBlacklist,
  updateBlacklistEntry,
  upsertBlacklistEntry,
  upsertWithdrawalTracking,
} from "../repositories/financeRepository";
import type { CommissionRow, WithdrawalEligibility } from "../types";
import { recordAuditLog } from '../../audit/services/auditService';
import { getLeaderByUserId } from "../../leaders/repositories/leaderRepository";

const DAILY_WITHDRAWAL_LIMIT = 500;
const WEEKLY_WITHDRAWAL_LIMIT_COUNT = 2;
const DEFAULT_COMMISSION_RATE = 0.06;

const assertApprovedLeader = async (leaderUserId: number) => {
  const leader = await getLeaderByUserId(leaderUserId);
  if (!leader || leader.status !== "APPROVED") {
    throw new Error("LEADER_NOT_ELIGIBLE_FOR_WITHDRAWAL");
  }

  return leader;
};

export const getCommissionSummary = async (params: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<CommissionRow[]> => {
  const bases = await getOrderCommissionBases(params);

  const rows: CommissionRow[] = [];
  for (const base of bases) {
    const overrideRate = await getLeaderCommissionRate({
      leaderUserId: base.leaderUserId,
      pickupPointId: base.pickupPointId,
    });

    const commissionRate = overrideRate ?? DEFAULT_COMMISSION_RATE;
    const commissionAmount = Number(
      (base.preTaxItemTotal * commissionRate).toFixed(2),
    );

    rows.push({
      leaderUserId: base.leaderUserId,
      pickupPointId: base.pickupPointId,
      preTaxItemTotal: Number(base.preTaxItemTotal.toFixed(2)),
      commissionRate,
      commissionAmount,
    });
  }

  return rows;
};

export const getWithdrawalEligibility = async (
  leaderUserId: number,
): Promise<WithdrawalEligibility> => {
  await assertApprovedLeader(leaderUserId);

  const blacklisted = await isLeaderBlacklisted(leaderUserId);
  if (blacklisted) {
    return {
      leaderUserId,
      blacklisted: true,
      remainingDailyAmount: 0,
      remainingWeeklyCount: 0,
      eligible: false,
      reason: "Leader is blacklisted for withdrawals.",
    };
  }

  const usage = await getWithdrawalWindowUsage(leaderUserId);
  const remainingDailyAmount = Number(
    Math.max(0, DAILY_WITHDRAWAL_LIMIT - usage.todayAmount).toFixed(2),
  );
  const remainingWeeklyCount = Math.max(
    0,
    WEEKLY_WITHDRAWAL_LIMIT_COUNT - usage.weekCount,
  );

  return {
    leaderUserId,
    blacklisted: false,
    remainingDailyAmount,
    remainingWeeklyCount,
    eligible: remainingDailyAmount > 0 && remainingWeeklyCount > 0,
    reason:
      remainingDailyAmount <= 0
        ? "Daily limit reached."
        : remainingWeeklyCount <= 0
          ? "Weekly withdrawal count reached."
          : null,
  };
};

export const requestWithdrawal = async (params: {
  leaderUserId: number;
  amount: number;
  requestedByUserId: number;
}) => {
  if (params.amount <= 0) {
    throw new Error("INVALID_WITHDRAWAL_AMOUNT");
  }

  await assertApprovedLeader(params.leaderUserId);

  const eligibility = await getWithdrawalEligibility(params.leaderUserId);
  if (!eligibility.eligible) {
    throw new Error("WITHDRAWAL_NOT_ELIGIBLE");
  }

  if (params.amount > eligibility.remainingDailyAmount) {
    throw new Error("WITHDRAWAL_DAILY_LIMIT_EXCEEDED");
  }

  if (eligibility.remainingWeeklyCount <= 0) {
    throw new Error("WITHDRAWAL_WEEKLY_LIMIT_EXCEEDED");
  }

  const withdrawal = await createWithdrawal({
    leaderUserId: params.leaderUserId,
    requestedAmount: Number(params.amount.toFixed(2)),
    decidedByUserId: params.requestedByUserId,
    decisionNote: "Auto-approved under configured risk controls.",
  });

  await upsertWithdrawalTracking({
    leaderUserId: params.leaderUserId,
    approvedAmount: withdrawal.requestedAmount,
  });

  await recordAuditLog({
    actorUserId: params.requestedByUserId,
    action: 'APPROVAL',
    resourceType: 'WITHDRAWAL',
    resourceId: withdrawal.id,
    metadata: {
      leaderUserId: params.leaderUserId,
      amount: withdrawal.requestedAmount,
      status: withdrawal.status
    }
  });

  return withdrawal;
};

const toCsvRow = (values: Array<string | number | null>): string =>
  values
    .map((value) => {
      const normalized = value === null ? "" : String(value);
      if (
        normalized.includes(",") ||
        normalized.includes('"') ||
        normalized.includes("\n")
      ) {
        return `"${normalized.replaceAll('"', '""')}"`;
      }
      return normalized;
    })
    .join(",");

export const getReconciliationCsv = async (params: {
  requestedByUserId: number;
  dateFrom: string;
  dateTo: string;
}) => {
  const rows = await getSettlementRowsForExport({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const header = toCsvRow([
    "order_id",
    "pickup_point_id",
    "member_user_id",
    "settled_amount",
    "status",
    "posted_at",
  ]);

  const lines = rows.map((row) =>
    toCsvRow([
      row.orderId,
      row.pickupPointId,
      row.memberUserId,
      row.settledAmount.toFixed(2),
      row.settlementStatus,
      row.postedAt,
    ]),
  );

  const csv = [header, ...lines].join("\n");

  await createReconciliationExportJob({
    requestedByUserId: params.requestedByUserId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    rowCount: rows.length,
    generatedFileName: `reconciliation-${params.dateFrom}-to-${params.dateTo}.csv`,
  });

  await recordAuditLog({
    actorUserId: params.requestedByUserId,
    action: 'DOWNLOAD',
    resourceType: 'RECONCILIATION_EXPORT',
    resourceId: null,
    metadata: {
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      rowCount: rows.length
    }
  });

  return {
    fileName: `reconciliation-${params.dateFrom}-to-${params.dateTo}.csv`,
    csv,
    rowCount: rows.length,
  };
};

export const getWithdrawalBlacklist = async () => listBlacklist();

export const addOrReplaceBlacklist = async (params: {
  userId: number;
  reason: string;
  active: boolean;
  createdByUserId: number;
}) => {
  await upsertBlacklistEntry(params);

  await recordAuditLog({
    actorUserId: params.createdByUserId,
    action: 'PERMISSION_CHANGE',
    resourceType: 'WITHDRAWAL_BLACKLIST',
    resourceId: params.userId,
    metadata: {
      reason: params.reason,
      active: params.active
    }
  });
};

export const patchBlacklistEntry = async (params: {
  id: number;
  reason?: string;
  active?: boolean;
  actorUserId: number;
}) => {
  const updated = await updateBlacklistEntry(params);
  if (updated) {
    await recordAuditLog({
      actorUserId: params.actorUserId,
      action: 'PERMISSION_CHANGE',
      resourceType: 'WITHDRAWAL_BLACKLIST',
      resourceId: params.id,
      metadata: {
        reason: params.reason,
        active: params.active
      }
    });
  }
  return updated;
};

export const removeBlacklistEntry = async (params: { id: number; actorUserId: number }) => {
  const deleted = await deleteBlacklistEntry(params.id);
  if (deleted) {
    await recordAuditLog({
      actorUserId: params.actorUserId,
      action: 'DELETE',
      resourceType: 'WITHDRAWAL_BLACKLIST',
      resourceId: params.id,
      metadata: null
    });
  }
  return deleted;
};
