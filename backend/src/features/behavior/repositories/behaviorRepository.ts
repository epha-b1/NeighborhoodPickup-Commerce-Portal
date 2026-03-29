import { dbPool } from '../../../db/pool';
import type { BehaviorEventInput, BehaviorSummaryRow } from '../types';

export const insertDedupKey = async (params: {
  idempotencyKey: string;
  eventType: string;
  userId: number | null;
}): Promise<boolean> => {
  const [result] = await dbPool.query<any>(
    `INSERT IGNORE INTO behavior_ingestion_dedup_keys (idempotency_key, event_type, user_id)
     VALUES (?, ?, ?)`,
    [params.idempotencyKey, params.eventType, params.userId]
  );

  return Number(result.affectedRows ?? 0) > 0;
};

export const insertBehaviorQueue = async (params: {
  idempotencyKey: string;
  payload: Record<string, unknown>;
}): Promise<void> => {
  await dbPool.query(
    `INSERT INTO behavior_ingestion_queue (idempotency_key, payload_json, status)
     VALUES (?, ?, 'PENDING')`,
    [params.idempotencyKey, JSON.stringify(params.payload)]
  );
};

export const listPendingBehaviorQueueItems = async (limit: number): Promise<
  Array<{
    id: number;
    payloadJson: unknown;
    retryCount: number;
  }>
> => {
  const [rows] = await dbPool.query<
    Array<{ id: number; payload_json: unknown; retry_count: number }>
  >(
    `SELECT id, payload_json, retry_count
     FROM behavior_ingestion_queue
     WHERE status = 'PENDING'
       AND available_at <= UTC_TIMESTAMP()
     ORDER BY id ASC
     LIMIT ?`,
    [limit]
  );

  return rows.map((row) => ({
    id: row.id,
    payloadJson: row.payload_json,
    retryCount: Number(row.retry_count)
  }));
};

export const markBehaviorQueueProcessed = async (queueId: number): Promise<void> => {
  await dbPool.query(
    `UPDATE behavior_ingestion_queue
     SET status = 'PROCESSED',
         processed_at = CURRENT_TIMESTAMP,
         last_error = NULL
     WHERE id = ?`,
    [queueId]
  );
};

export const markBehaviorQueueFailed = async (params: {
  queueId: number;
  retryCount: number;
  errorMessage: string;
  maxRetries: number;
}): Promise<void> => {
  const nextRetryCount = params.retryCount + 1;

  if (nextRetryCount >= params.maxRetries) {
    await dbPool.query(
      `UPDATE behavior_ingestion_queue
       SET status = 'FAILED',
           retry_count = ?,
           last_error = ?,
           processed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextRetryCount, params.errorMessage.slice(0, 255), params.queueId]
    );
    return;
  }

  const delaySeconds = Math.min(300, Math.pow(2, nextRetryCount));
  await dbPool.query(
    `UPDATE behavior_ingestion_queue
     SET status = 'PENDING',
         retry_count = ?,
         last_error = ?,
         available_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND)
     WHERE id = ?`,
    [nextRetryCount, params.errorMessage.slice(0, 255), delaySeconds, params.queueId]
  );
};

export const insertBehaviorHotEvent = async (params: {
  userId: number | null;
  event: BehaviorEventInput;
}): Promise<void> => {
  await dbPool.query(
    `INSERT INTO behavior_events_hot
      (idempotency_key, event_type, user_id, resource_type, resource_id, client_recorded_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.event.idempotencyKey,
      params.event.eventType,
      params.userId,
      params.event.resourceType,
      params.event.resourceId ?? null,
      params.event.clientRecordedAt ?? null,
      params.event.metadata ? JSON.stringify(params.event.metadata) : null
    ]
  );
};

export const getBehaviorSummaryRows = async (params: {
  from?: string;
  to?: string;
}): Promise<BehaviorSummaryRow[]> => {
  const filters: string[] = [];
  const values: string[] = [];

  if (params.from) {
    filters.push('server_recorded_at >= ?');
    values.push(`${params.from} 00:00:00`);
  }
  if (params.to) {
    filters.push('server_recorded_at <= ?');
    values.push(`${params.to} 23:59:59`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const [rows] = await dbPool.query<{ event_type: BehaviorSummaryRow['eventType']; event_count: number }[]>(
    `SELECT event_type, COUNT(*) AS event_count
     FROM behavior_events_hot
     ${whereClause}
     GROUP BY event_type
     ORDER BY event_type ASC`,
    values
  );

  return rows.map((row) => ({
    eventType: row.event_type,
    eventCount: Number(row.event_count)
  }));
};

export const getRetentionStatusCounts = async (): Promise<{
  hotCount: number;
  archiveCount: number;
  queuePending: number;
}> => {
  const [[hot]] = await dbPool.query<{ total: number }[]>(
    'SELECT COUNT(*) AS total FROM behavior_events_hot'
  );
  const [[archive]] = await dbPool.query<{ total: number }[]>(
    'SELECT COUNT(*) AS total FROM behavior_events_archive'
  );
  const [[queue]] = await dbPool.query<{ total: number }[]>(
    "SELECT COUNT(*) AS total FROM behavior_ingestion_queue WHERE status = 'PENDING'"
  );

  return {
    hotCount: Number(hot?.total ?? 0),
    archiveCount: Number(archive?.total ?? 0),
    queuePending: Number(queue?.total ?? 0)
  };
};

export const archiveExpiredHotEvents = async (): Promise<number> => {
  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();

    const [candidates] = await conn.query<{ id: number }[]>(
      `SELECT id
       FROM behavior_events_hot
       WHERE server_recorded_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)
       ORDER BY id ASC
       LIMIT 2000`
    );

    if (candidates.length === 0) {
      await conn.commit();
      return 0;
    }

    const ids = candidates.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');

    await conn.query(
      `INSERT INTO behavior_events_archive
        (source_hot_id, idempotency_key, event_type, user_id, resource_type, resource_id, client_recorded_at, server_recorded_at, metadata_json)
       SELECT id, idempotency_key, event_type, user_id, resource_type, resource_id, client_recorded_at, server_recorded_at, metadata_json
       FROM behavior_events_hot
       WHERE id IN (${placeholders})`,
      ids
    );

    await conn.query(`DELETE FROM behavior_events_hot WHERE id IN (${placeholders})`, ids);

    await conn.commit();
    return ids.length;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

export const purgeOldArchiveEvents = async (): Promise<number> => {
  const [result] = await dbPool.query<any>(
    `DELETE FROM behavior_events_archive
     WHERE server_recorded_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 365 DAY)
     LIMIT 5000`
  );

  return Number(result.affectedRows ?? 0);
};
