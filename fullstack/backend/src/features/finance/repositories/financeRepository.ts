import { dbPool } from "../../../db/pool";
import type { BlacklistRecord, WithdrawalRecord } from "../types";

const toIso = (value: Date | string): string => new Date(value).toISOString();

export const getOrderCommissionBases = async (params: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<
  Array<{
    leaderUserId: number;
    pickupPointId: number;
    preTaxItemTotal: number;
  }>
> => {
  const whereClauses = ["o.status = 'CONFIRMED'"];
  const queryParams: Array<string> = [];

  if (params.dateFrom) {
    whereClauses.push("DATE(o.created_at) >= ?");
    queryParams.push(params.dateFrom);
  }

  if (params.dateTo) {
    whereClauses.push("DATE(o.created_at) <= ?");
    queryParams.push(params.dateTo);
  }

  const [rows] = await dbPool.query<
    { leader_user_id: number; pickup_point_id: number; pre_tax_total: string }[]
  >(
    `SELECT l.leader_user_id,
            o.pickup_point_id,
            SUM(GREATEST(oi.line_subtotal - oi.line_discount - oi.line_subsidy, 0)) AS pre_tax_total
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN listings l ON l.id = oi.listing_id
     WHERE ${whereClauses.join(" AND ")}
     GROUP BY l.leader_user_id, o.pickup_point_id`,
    queryParams,
  );

  return rows.map((row) => ({
    leaderUserId: row.leader_user_id,
    pickupPointId: row.pickup_point_id,
    preTaxItemTotal: Number(row.pre_tax_total),
  }));
};

export const getLeaderCommissionRate = async (params: {
  leaderUserId: number;
  pickupPointId: number;
}): Promise<number | null> => {
  const [rows] = await dbPool.query<{ commission_rate: string }[]>(
    `SELECT lcr.commission_rate
     FROM leaders ld
     JOIN leader_commission_rules lcr ON lcr.leader_id = ld.id
     WHERE ld.user_id = ?
       AND (lcr.pickup_point_id = ? OR lcr.pickup_point_id IS NULL)
       AND lcr.effective_from <= UTC_TIMESTAMP()
       AND (lcr.effective_to IS NULL OR lcr.effective_to >= UTC_TIMESTAMP())
     ORDER BY CASE WHEN lcr.pickup_point_id = ? THEN 0 ELSE 1 END,
              lcr.effective_from DESC
     LIMIT 1`,
    [params.leaderUserId, params.pickupPointId, params.pickupPointId],
  );

  if (rows.length === 0) {
    return null;
  }

  return Number(rows[0].commission_rate);
};

export const isLeaderBlacklisted = async (
  leaderUserId: number,
): Promise<boolean> => {
  const [rows] = await dbPool.query<{ total: number }[]>(
    "SELECT COUNT(*) AS total FROM withdrawal_blacklist WHERE user_id = ? AND active = 1",
    [leaderUserId],
  );
  return Number(rows[0]?.total ?? 0) > 0;
};

export const getWithdrawalWindowUsage = async (
  leaderUserId: number,
): Promise<{
  todayAmount: number;
  weekCount: number;
}> => {
  const [dailyRows] = await dbPool.query<{ total: string }[]>(
    `SELECT COALESCE(SUM(requested_amount), 0) AS total
     FROM finance_withdrawals
     WHERE leader_user_id = ?
       AND status <> 'REJECTED'
       AND DATE(requested_at) = UTC_DATE()`,
    [leaderUserId],
  );

  const [weeklyRows] = await dbPool.query<{ total: number }[]>(
    `SELECT COUNT(*) AS total
     FROM finance_withdrawals
     WHERE leader_user_id = ?
       AND status <> 'REJECTED'
       AND YEARWEEK(requested_at, 1) = YEARWEEK(UTC_DATE(), 1)`,
    [leaderUserId],
  );

  return {
    todayAmount: Number(dailyRows[0]?.total ?? 0),
    weekCount: Number(weeklyRows[0]?.total ?? 0),
  };
};

export const createWithdrawal = async (params: {
  leaderUserId: number;
  requestedAmount: number;
  decidedByUserId: number;
  decisionNote: string;
}): Promise<WithdrawalRecord> => {
  const [insertResult] = await dbPool.query<any>(
    `INSERT INTO finance_withdrawals
      (leader_user_id, requested_amount, status, decided_at, decided_by_user_id, decision_note)
     VALUES (?, ?, 'APPROVED', CURRENT_TIMESTAMP, ?, ?)`,
    [
      params.leaderUserId,
      params.requestedAmount,
      params.decidedByUserId,
      params.decisionNote,
    ],
  );

  const [rows] = await dbPool.query<
    {
      id: number;
      leader_user_id: number;
      requested_amount: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
      requested_at: Date | string;
      decided_at: Date | string | null;
      decided_by_user_id: number | null;
      decision_note: string | null;
    }[]
  >(
    `SELECT id,
            leader_user_id,
            requested_amount,
            status,
            requested_at,
            decided_at,
            decided_by_user_id,
            decision_note
     FROM finance_withdrawals
     WHERE id = ?
     LIMIT 1`,
    [Number(insertResult.insertId)],
  );

  const row = rows[0];
  return {
    id: row.id,
    leaderUserId: row.leader_user_id,
    requestedAmount: Number(row.requested_amount),
    status: row.status,
    requestedAt: toIso(row.requested_at),
    decidedAt: row.decided_at ? toIso(row.decided_at) : null,
    decidedByUserId: row.decided_by_user_id,
    decisionNote: row.decision_note,
  };
};

export const upsertWithdrawalTracking = async (params: {
  leaderUserId: number;
  approvedAmount: number;
}): Promise<void> => {
  await dbPool.query(
    `INSERT INTO withdrawal_limits_tracking
      (leader_user_id, window_date, approved_daily_total, approved_week_count, week_start_date)
     VALUES (?, UTC_DATE(), ?, 1, DATE_SUB(UTC_DATE(), INTERVAL WEEKDAY(UTC_DATE()) DAY))
     ON DUPLICATE KEY UPDATE
       approved_daily_total = approved_daily_total + VALUES(approved_daily_total),
       approved_week_count = approved_week_count + 1,
       week_start_date = VALUES(week_start_date)`,
    [params.leaderUserId, params.approvedAmount],
  );
};

export const getSettlementRowsForExport = async (params: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<
  Array<{
    orderId: number;
    settledAmount: number;
    settlementStatus: string;
    postedAt: string | null;
    pickupPointId: number;
    memberUserId: number;
  }>
> => {
  const whereClauses = ["1 = 1"];
  const queryParams: Array<string> = [];

  if (params.dateFrom) {
    whereClauses.push("DATE(s.created_at) >= ?");
    queryParams.push(params.dateFrom);
  }

  if (params.dateTo) {
    whereClauses.push("DATE(s.created_at) <= ?");
    queryParams.push(params.dateTo);
  }

  const [rows] = await dbPool.query<
    {
      order_id: number;
      settled_amount: string;
      status: string;
      posted_at: Date | string | null;
      pickup_point_id: number;
      user_id: number;
    }[]
  >(
    `SELECT s.order_id,
            s.settled_amount,
            s.status,
            s.posted_at,
            o.pickup_point_id,
            o.user_id
     FROM settlements s
     JOIN orders o ON o.id = s.order_id
     WHERE ${whereClauses.join(" AND ")}
     ORDER BY s.created_at DESC`,
    queryParams,
  );

  return rows.map((row) => ({
    orderId: row.order_id,
    settledAmount: Number(row.settled_amount),
    settlementStatus: row.status,
    postedAt: row.posted_at ? toIso(row.posted_at) : null,
    pickupPointId: row.pickup_point_id,
    memberUserId: row.user_id,
  }));
};

export const createReconciliationExportJob = async (params: {
  requestedByUserId: number;
  dateFrom: string;
  dateTo: string;
  rowCount: number;
  generatedFileName: string;
}): Promise<void> => {
  await dbPool.query(
    `INSERT INTO reconciliation_export_jobs
      (requested_by_user_id, date_from, date_to, row_count, generated_file_name)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.requestedByUserId,
      params.dateFrom,
      params.dateTo,
      params.rowCount,
      params.generatedFileName,
    ],
  );
};

export const listBlacklist = async (): Promise<BlacklistRecord[]> => {
  const [rows] = await dbPool.query<
    {
      id: number;
      user_id: number;
      reason: string;
      active: number;
      created_by_user_id: number | null;
      created_at: Date | string;
      updated_at: Date | string;
    }[]
  >(
    `SELECT id, user_id, reason, active, created_by_user_id, created_at, updated_at
     FROM withdrawal_blacklist
     ORDER BY updated_at DESC`,
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    reason: row.reason,
    active: row.active === 1,
    createdByUserId: row.created_by_user_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }));
};

export const upsertBlacklistEntry = async (params: {
  userId: number;
  reason: string;
  active: boolean;
  createdByUserId: number;
}): Promise<void> => {
  await dbPool.query(
    `INSERT INTO withdrawal_blacklist
      (user_id, reason, active, created_by_user_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       reason = VALUES(reason),
       active = VALUES(active),
       updated_at = CURRENT_TIMESTAMP`,
    [
      params.userId,
      params.reason,
      params.active ? 1 : 0,
      params.createdByUserId,
    ],
  );
};

export const updateBlacklistEntry = async (params: {
  id: number;
  reason?: string;
  active?: boolean;
}): Promise<boolean> => {
  const updates: string[] = [];
  const queryParams: Array<string | number> = [];

  if (typeof params.reason === "string") {
    updates.push("reason = ?");
    queryParams.push(params.reason);
  }

  if (typeof params.active === "boolean") {
    updates.push("active = ?");
    queryParams.push(params.active ? 1 : 0);
  }

  if (updates.length === 0) {
    return false;
  }

  queryParams.push(params.id);

  const [result] = await dbPool.query<any>(
    `UPDATE withdrawal_blacklist
     SET ${updates.join(", ")},
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    queryParams,
  );

  return Number(result.affectedRows ?? 0) > 0;
};

export const deleteBlacklistEntry = async (id: number): Promise<boolean> => {
  const [result] = await dbPool.query<any>(
    "DELETE FROM withdrawal_blacklist WHERE id = ?",
    [id],
  );
  return Number(result.affectedRows ?? 0) > 0;
};
