import { dbPool } from '../../../db/pool';
import type { AuditAction, AuditLogRecord, AuditSearchParams } from '../types';

const toIso = (value: Date | string): string => new Date(value).toISOString();

const mapRow = (row: {
  id: number;
  actor_user_id: number | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string | null;
  metadata_json: string | null;
  hash_basis: string;
  previous_hash: string | null;
  current_hash: string;
  created_at: Date | string;
}): AuditLogRecord => ({
  id: row.id,
  actorUserId: row.actor_user_id,
  action: row.action,
  resourceType: row.resource_type,
  resourceId: row.resource_id,
  metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null,
  hashBasis: row.hash_basis,
  previousHash: row.previous_hash,
  currentHash: row.current_hash,
  createdAt: toIso(row.created_at)
});

export const getLastAuditHash = async (): Promise<string | null> => {
  const [rows] = await dbPool.query<{ current_hash: string }[]>(
    'SELECT current_hash FROM audit_logs ORDER BY id DESC LIMIT 1'
  );
  return rows[0]?.current_hash ?? null;
};

export const insertAuditLog = async (params: {
  actorUserId: number | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  hashBasis: string;
  previousHash: string | null;
  currentHash: string;
}): Promise<AuditLogRecord> => {
  const [result] = await dbPool.query<any>(
    `INSERT INTO audit_logs
      (actor_user_id, action, resource_type, resource_id, metadata_json, hash_basis, previous_hash, current_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.actorUserId,
      params.action,
      params.resourceType,
      params.resourceId,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.hashBasis,
      params.previousHash,
      params.currentHash
    ]
  );

  const [rows] = await dbPool.query<
    {
      id: number;
      actor_user_id: number | null;
      action: AuditAction;
      resource_type: string;
      resource_id: string | null;
      metadata_json: string | null;
      hash_basis: string;
      previous_hash: string | null;
      current_hash: string;
      created_at: Date | string;
    }[]
  >(
    `SELECT id, actor_user_id, action, resource_type, resource_id, CAST(metadata_json AS CHAR) AS metadata_json,
            hash_basis, previous_hash, current_hash, created_at
     FROM audit_logs WHERE id = ? LIMIT 1`,
    [Number(result.insertId)]
  );

  return mapRow(rows[0]);
};

export const searchAuditLogs = async (params: AuditSearchParams): Promise<{ total: number; rows: AuditLogRecord[] }> => {
  const filters: string[] = [];
  const values: Array<string | number> = [];

  if (params.actorUserId) {
    filters.push('actor_user_id = ?');
    values.push(params.actorUserId);
  }
  if (params.resourceType) {
    filters.push('resource_type = ?');
    values.push(params.resourceType);
  }
  if (params.action) {
    filters.push('action = ?');
    values.push(params.action);
  }
  if (params.from) {
    filters.push('created_at >= ?');
    values.push(`${params.from} 00:00:00`);
  }
  if (params.to) {
    filters.push('created_at <= ?');
    values.push(`${params.to} 23:59:59`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const [countRows] = await dbPool.query<{ total: number }[]>(
    `SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`,
    values
  );

  const offset = (params.page - 1) * params.pageSize;
  const [rows] = await dbPool.query<
    {
      id: number;
      actor_user_id: number | null;
      action: AuditAction;
      resource_type: string;
      resource_id: string | null;
      metadata_json: string | null;
      hash_basis: string;
      previous_hash: string | null;
      current_hash: string;
      created_at: Date | string;
    }[]
  >(
    `SELECT id, actor_user_id, action, resource_type, resource_id, CAST(metadata_json AS CHAR) AS metadata_json,
            hash_basis, previous_hash, current_hash, created_at
     FROM audit_logs
     ${whereClause}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...values, params.pageSize, offset]
  );

  return {
    total: Number(countRows[0]?.total ?? 0),
    rows: rows.map(mapRow)
  };
};

export const listAuditLogsByIdAsc = async (): Promise<AuditLogRecord[]> => {
  const [rows] = await dbPool.query<
    {
      id: number;
      actor_user_id: number | null;
      action: AuditAction;
      resource_type: string;
      resource_id: string | null;
      metadata_json: string | null;
      hash_basis: string;
      previous_hash: string | null;
      current_hash: string;
      created_at: Date | string;
    }[]
  >(
    `SELECT id, actor_user_id, action, resource_type, resource_id, CAST(metadata_json AS CHAR) AS metadata_json,
            hash_basis, previous_hash, current_hash, created_at
     FROM audit_logs
     ORDER BY id ASC`
  );

  return rows.map(mapRow);
};
