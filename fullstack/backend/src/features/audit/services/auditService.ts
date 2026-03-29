import crypto from 'crypto';
import {
  getLastAuditHash,
  insertAuditLog,
  listAuditLogsByIdAsc,
  searchAuditLogs
} from '../repositories/auditRepository';
import type { AuditAction, AuditSearchParams } from '../types';

const buildHash = (previousHash: string | null, hashBasis: string): string =>
  crypto
    .createHash('sha256')
    .update(`${previousHash ?? ''}|${hashBasis}`)
    .digest('hex');

export const recordAuditLog = async (params: {
  actorUserId: number | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | number | null;
  metadata?: Record<string, unknown> | null;
}) => {
  const previousHash = await getLastAuditHash();
  const hashBasis = JSON.stringify({
    at: new Date().toISOString(),
    actorUserId: params.actorUserId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    metadata: params.metadata ?? null
  });

  const currentHash = buildHash(previousHash, hashBasis);

  return insertAuditLog({
    actorUserId: params.actorUserId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId === undefined || params.resourceId === null ? null : String(params.resourceId),
    metadata: params.metadata ?? null,
    hashBasis,
    previousHash,
    currentHash
  });
};

export const getAuditSearch = async (params: AuditSearchParams) => searchAuditLogs(params);

export const getAuditExportCsv = async (params: AuditSearchParams) => {
  const result = await searchAuditLogs(params);
  const header = [
    'id',
    'actor_user_id',
    'action',
    'resource_type',
    'resource_id',
    'created_at',
    'previous_hash',
    'current_hash'
  ].join(',');

  const rows = result.rows.map((row) =>
    [
      row.id,
      row.actorUserId ?? '',
      row.action,
      row.resourceType,
      row.resourceId ?? '',
      row.createdAt,
      row.previousHash ?? '',
      row.currentHash
    ]
      .map((value) => {
        const text = String(value);
        return text.includes(',') ? `"${text.replaceAll('"', '""')}"` : text;
      })
      .join(',')
  );

  return `${header}\n${rows.join('\n')}`;
};

export const verifyAuditChain = async () => {
  const rows = await listAuditLogsByIdAsc();
  const failures: Array<{ id: number; reason: string }> = [];

  let previousHash: string | null = null;
  for (const row of rows) {
    if (row.previousHash !== previousHash) {
      failures.push({ id: row.id, reason: 'PREVIOUS_HASH_MISMATCH' });
    }

    const expectedCurrent = buildHash(row.previousHash, row.hashBasis);
    if (row.currentHash !== expectedCurrent) {
      failures.push({ id: row.id, reason: 'CURRENT_HASH_INVALID' });
    }

    previousHash = row.currentHash;
  }

  return {
    total: rows.length,
    valid: failures.length === 0,
    failures
  };
};
