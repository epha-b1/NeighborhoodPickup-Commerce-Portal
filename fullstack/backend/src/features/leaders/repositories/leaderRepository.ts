import { dbPool } from "../../../db/pool";
import type {
  CreateLeaderApplicationInput,
  LeaderApplicationDecision,
  LeaderApplicationRecord,
  LeaderDashboardMetrics,
} from "../types";

const toIso = (value: Date | string): string => new Date(value).toISOString();

type LeaderRecord = {
  id: number;
  user_id: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  commission_eligible: number;
};

export const getLeaderByUserId = async (
  userId: number,
): Promise<LeaderRecord | null> => {
  const [rows] = await dbPool.query<LeaderRecord[]>(
    `SELECT id, user_id, status, commission_eligible
     FROM leaders
     WHERE user_id = ?
     LIMIT 1`,
    [userId],
  );

  return rows[0] ?? null;
};

export const getLatestApplicationByUserId = async (
  userId: number,
): Promise<LeaderApplicationRecord | null> => {
  const [rows] = await dbPool.query<
    Array<{
      id: number;
      user_id: number;
      full_name: string;
      phone: string;
      experience_summary: string;
      pickup_point_id: number | null;
      requested_commission_eligible: number;
      status: "PENDING" | "APPROVED" | "REJECTED";
      submitted_at: Date | string;
      reviewed_at: Date | string | null;
      decision_reason: string | null;
      decision_by_admin_id: number | null;
      decision_by_admin_username: string | null;
      decision_commission_eligible: number | null;
      decision_at: Date | string | null;
    }>
  >(
    `SELECT la.id,
            la.user_id,
            la.full_name,
            la.phone,
            la.experience_summary,
            la.pickup_point_id,
            la.requested_commission_eligible,
            la.status,
            la.submitted_at,
            la.reviewed_at,
            appr.reason AS decision_reason,
            appr.admin_user_id AS decision_by_admin_id,
            au.username AS decision_by_admin_username,
            appr.commission_eligible AS decision_commission_eligible,
            appr.created_at AS decision_at
     FROM leader_applications la
     LEFT JOIN leader_approvals appr ON appr.leader_application_id = la.id
     LEFT JOIN users au ON au.id = appr.admin_user_id
     WHERE la.user_id = ?
     ORDER BY la.submitted_at DESC, la.id DESC
     LIMIT 1`,
    [userId],
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    phone: row.phone,
    experienceSummary: row.experience_summary,
    pickupPointId: row.pickup_point_id,
    requestedCommissionEligible: row.requested_commission_eligible === 1,
    status: row.status,
    submittedAt: toIso(row.submitted_at),
    reviewedAt: row.reviewed_at ? toIso(row.reviewed_at) : null,
    decisionReason: row.decision_reason,
    decisionByAdminId: row.decision_by_admin_id,
    decisionByAdminUsername: row.decision_by_admin_username,
    decisionCommissionEligible:
      row.decision_commission_eligible === null
        ? null
        : row.decision_commission_eligible === 1,
    decisionAt: row.decision_at ? toIso(row.decision_at) : null,
  };
};

export const createLeaderApplication = async (params: {
  userId: number;
  input: CreateLeaderApplicationInput;
}): Promise<LeaderApplicationRecord> => {
  await dbPool.query(
    `INSERT INTO leader_applications
      (user_id, full_name, phone, experience_summary, pickup_point_id, requested_commission_eligible, status)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
    [
      params.userId,
      params.input.fullName,
      params.input.phone,
      params.input.experienceSummary,
      params.input.pickupPointId ?? null,
      params.input.requestedCommissionEligible ? 1 : 0,
    ],
  );

  const latest = await getLatestApplicationByUserId(params.userId);
  if (!latest) {
    throw new Error("APPLICATION_NOT_FOUND_AFTER_CREATE");
  }

  return latest;
};

export const listPendingApplications = async (): Promise<
  LeaderApplicationRecord[]
> => {
  const [rows] = await dbPool.query<
    Array<{
      id: number;
      user_id: number;
      full_name: string;
      phone: string;
      experience_summary: string;
      pickup_point_id: number | null;
      requested_commission_eligible: number;
      status: "PENDING" | "APPROVED" | "REJECTED";
      submitted_at: Date | string;
      reviewed_at: Date | string | null;
    }>
  >(
    `SELECT id,
            user_id,
            full_name,
            phone,
            experience_summary,
            pickup_point_id,
            requested_commission_eligible,
            status,
            submitted_at,
            reviewed_at
     FROM leader_applications
     WHERE status = 'PENDING'
     ORDER BY submitted_at ASC, id ASC`,
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    phone: row.phone,
    experienceSummary: row.experience_summary,
    pickupPointId: row.pickup_point_id,
    requestedCommissionEligible: row.requested_commission_eligible === 1,
    status: row.status,
    submittedAt: toIso(row.submitted_at),
    reviewedAt: row.reviewed_at ? toIso(row.reviewed_at) : null,
    decisionReason: null,
    decisionByAdminId: null,
    decisionByAdminUsername: null,
    decisionCommissionEligible: null,
    decisionAt: null,
  }));
};

export const decideLeaderApplication = async (params: {
  applicationId: number;
  adminUserId: number;
  decision: "APPROVED" | "REJECTED";
  reason: string;
  commissionEligible: boolean;
}): Promise<LeaderApplicationDecision> => {
  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();

    const [applicationRows] = await conn.query<
      Array<{
        id: number;
        user_id: number;
        pickup_point_id: number | null;
        status: "PENDING" | "APPROVED" | "REJECTED";
      }>
    >(
      `SELECT id, user_id, pickup_point_id, status
       FROM leader_applications
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [params.applicationId],
    );

    if (applicationRows.length === 0) {
      throw new Error("LEADER_APPLICATION_NOT_FOUND");
    }

    const application = applicationRows[0];
    if (application.status !== "PENDING") {
      throw new Error("LEADER_APPLICATION_ALREADY_REVIEWED");
    }

    await conn.query(
      `UPDATE leader_applications
       SET status = ?,
           reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [params.decision, params.applicationId],
    );

    await conn.query(
      `INSERT INTO leader_approvals
        (leader_application_id, admin_user_id, decision, reason, commission_eligible)
       VALUES (?, ?, ?, ?, ?)`,
      [
        params.applicationId,
        params.adminUserId,
        params.decision,
        params.reason,
        params.commissionEligible ? 1 : 0,
      ],
    );

    const leaderStatus =
      params.decision === "APPROVED" ? "APPROVED" : "REJECTED";

    await conn.query(
      `INSERT INTO leaders
        (user_id, pickup_point_id, status, commission_eligible, approved_at)
       VALUES (?, ?, ?, ?, CASE WHEN ? = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE NULL END)
       ON DUPLICATE KEY UPDATE
        pickup_point_id = VALUES(pickup_point_id),
        status = VALUES(status),
        commission_eligible = VALUES(commission_eligible),
        approved_at = CASE WHEN VALUES(status) = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE approved_at END`,
      [
        application.user_id,
        application.pickup_point_id,
        leaderStatus,
        params.commissionEligible ? 1 : 0,
        params.decision,
      ],
    );

    if (params.decision === "APPROVED") {
      await conn.query(
        `INSERT IGNORE INTO user_roles (user_id, role_id)
         SELECT ?, r.id
         FROM roles r
         WHERE r.name = 'GROUP_LEADER'`,
        [application.user_id],
      );
    }

    if (params.decision === "APPROVED") {
      const [leaderRows] = await conn.query<Array<{ id: number }>>(
        "SELECT id FROM leaders WHERE user_id = ? LIMIT 1",
        [application.user_id],
      );

      if (leaderRows.length > 0) {
        const leaderId = leaderRows[0].id;
        const [existingRuleRows] = await conn.query<Array<{ id: number }>>(
          `SELECT id
           FROM leader_commission_rules
           WHERE leader_id = ?
             AND pickup_point_id <=> ?
             AND effective_to IS NULL
           ORDER BY effective_from DESC
           LIMIT 1`,
          [leaderId, application.pickup_point_id],
        );

        if (existingRuleRows.length === 0) {
          await conn.query(
            `INSERT INTO leader_commission_rules
              (leader_id, pickup_point_id, commission_rate, effective_from, created_by_user_id, note)
             VALUES (?, ?, 0.0600, UTC_TIMESTAMP(), ?, 'Default commission assignment on approval')`,
            [leaderId, application.pickup_point_id, params.adminUserId],
          );
        }
      }
    }

    const [decisionRows] = await conn.query<
      Array<{
        id: number;
        leader_application_id: number;
        admin_user_id: number;
        admin_username: string;
        decision: "APPROVED" | "REJECTED";
        reason: string;
        commission_eligible: number;
        created_at: Date | string;
      }>
    >(
      `SELECT la.id,
              la.leader_application_id,
              la.admin_user_id,
              u.username AS admin_username,
              la.decision,
              la.reason,
              la.commission_eligible,
              la.created_at
       FROM leader_approvals la
       JOIN users u ON u.id = la.admin_user_id
       WHERE la.leader_application_id = ?
       ORDER BY la.id DESC
       LIMIT 1`,
      [params.applicationId],
    );

    await conn.commit();

    const row = decisionRows[0];
    return {
      id: row.id,
      leaderApplicationId: row.leader_application_id,
      adminUserId: row.admin_user_id,
      adminUsername: row.admin_username,
      decision: row.decision,
      reason: row.reason,
      commissionEligible: row.commission_eligible === 1,
      createdAt: toIso(row.created_at),
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

const listDerivedMetrics = async (params: {
  leaderUserId: number;
  dateFrom: string;
  dateTo: string;
}): Promise<
  Array<{
    metricDate: string;
    orderVolume: number;
    fulfilledOrders: number;
    feedbackScoreAvg: number | null;
    feedbackCount: number;
  }>
> => {
  const [rows] = await dbPool.query<
    Array<{
      metric_date: string;
      order_volume: number;
      fulfilled_orders: number;
    }>
  >(
    `SELECT DATE(o.created_at) AS metric_date,
            COUNT(DISTINCT o.id) AS order_volume,
            SUM(CASE WHEN o.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS fulfilled_orders
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN listings l ON l.id = oi.listing_id
     WHERE l.leader_user_id = ?
       AND DATE(o.created_at) BETWEEN ? AND ?
     GROUP BY DATE(o.created_at)
     ORDER BY DATE(o.created_at) ASC`,
    [params.leaderUserId, params.dateFrom, params.dateTo],
  );

  return rows.map((row) => ({
    metricDate: row.metric_date,
    orderVolume: Number(row.order_volume),
    fulfilledOrders: Number(row.fulfilled_orders),
    feedbackScoreAvg: null,
    feedbackCount: 0,
  }));
};

const listStoredDailyMetrics = async (params: {
  leaderId: number;
  dateFrom: string;
  dateTo: string;
}) => {
  const [rows] = await dbPool.query<
    Array<{
      metric_date: string;
      order_volume: number;
      fulfilled_orders: number;
      feedback_score_avg: string | null;
      feedback_count: number;
    }>
  >(
    `SELECT metric_date,
            order_volume,
            fulfilled_orders,
            feedback_score_avg,
            feedback_count
     FROM leader_metrics_daily
     WHERE leader_id = ?
       AND metric_date BETWEEN ? AND ?
     ORDER BY metric_date ASC`,
    [params.leaderId, params.dateFrom, params.dateTo],
  );

  return rows.map((row) => ({
    metricDate: row.metric_date,
    orderVolume: Number(row.order_volume),
    fulfilledOrders: Number(row.fulfilled_orders),
    feedbackScoreAvg:
      row.feedback_score_avg === null ? null : Number(row.feedback_score_avg),
    feedbackCount: Number(row.feedback_count),
  }));
};

export const getLeaderDashboardMetrics = async (params: {
  leaderUserId: number;
  dateFrom: string;
  dateTo: string;
}): Promise<LeaderDashboardMetrics | null> => {
  const leader = await getLeaderByUserId(params.leaderUserId);
  if (!leader) {
    return null;
  }

  const stored = await listStoredDailyMetrics({
    leaderId: leader.id,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const dailyRows =
    stored.length > 0
      ? stored
      : await listDerivedMetrics({
          leaderUserId: params.leaderUserId,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
        });

  const orderVolume = dailyRows.reduce((sum, row) => sum + row.orderVolume, 0);
  const fulfilledOrders = dailyRows.reduce(
    (sum, row) => sum + row.fulfilledOrders,
    0,
  );
  const fulfillmentRate =
    orderVolume === 0
      ? 0
      : Number(((fulfilledOrders / orderVolume) * 100).toFixed(2));

  const latest7 = dailyRows
    .slice(-7)
    .map((row) => row.feedbackScoreAvg)
    .filter((v): v is number => v !== null);
  const previous7 = dailyRows
    .slice(
      Math.max(0, dailyRows.length - 14),
      Math.max(0, dailyRows.length - 7),
    )
    .map((row) => row.feedbackScoreAvg)
    .filter((v): v is number => v !== null);

  const avg = (values: number[]): number | null => {
    if (values.length === 0) {
      return null;
    }
    return Number(
      (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(
        2,
      ),
    );
  };

  const latest7Avg = avg(latest7);
  const previous7Avg = avg(previous7);

  let direction: "UP" | "DOWN" | "FLAT" | "NO_DATA" = "NO_DATA";
  if (latest7Avg !== null && previous7Avg !== null) {
    if (latest7Avg > previous7Avg) {
      direction = "UP";
    } else if (latest7Avg < previous7Avg) {
      direction = "DOWN";
    } else {
      direction = "FLAT";
    }
  }

  return {
    leaderId: leader.id,
    windowStartDate: params.dateFrom,
    windowEndDate: params.dateTo,
    orderVolume,
    fulfillmentRate,
    feedbackTrend: {
      latest7DayAverage: latest7Avg,
      previous7DayAverage: previous7Avg,
      direction,
    },
    daily: dailyRows.map((row) => ({
      metricDate: row.metricDate,
      orderVolume: row.orderVolume,
      fulfillmentRate:
        row.orderVolume === 0
          ? 0
          : Number(((row.fulfilledOrders / row.orderVolume) * 100).toFixed(2)),
      feedbackScoreAvg: row.feedbackScoreAvg,
      feedbackCount: row.feedbackCount,
    })),
  };
};
