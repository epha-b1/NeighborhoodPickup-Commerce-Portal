export type AuditAction =
  | 'UPLOAD'
  | 'DOWNLOAD'
  | 'SHARE'
  | 'PERMISSION_CHANGE'
  | 'APPROVAL'
  | 'DELETE'
  | 'ROLLBACK';

export type AuditLogRecord = {
  id: number;
  actorUserId: number | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  hashBasis: string;
  previousHash: string | null;
  currentHash: string;
  createdAt: string;
};

export type AuditSearchParams = {
  actorUserId?: number;
  resourceType?: string;
  action?: AuditAction;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};
