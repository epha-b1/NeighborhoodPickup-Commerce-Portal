import { apiRequest } from "./client";

export type AuditLogEntry = {
  id: number;
  actorUserId: number | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  previousHash: string | null;
  currentHash: string;
  createdAt: string;
};

export type AuditSearchResponse = {
  page: number;
  pageSize: number;
  total: number;
  data: AuditLogEntry[];
};

export type AuditChainResult = {
  total: number;
  valid: boolean;
  failures: Array<{ id: number; reason: string }>;
};

const buildQuery = (params: {
  page?: number;
  pageSize?: number;
  actorUserId?: number;
  resourceType?: string;
  action?: string;
  from?: string;
  to?: string;
}): string => {
  const q = new URLSearchParams();
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 20));
  if (params.actorUserId) q.set("actorUserId", String(params.actorUserId));
  if (params.resourceType) q.set("resourceType", params.resourceType);
  if (params.action) q.set("action", params.action);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  return q.toString();
};

export const auditApi = {
  searchLogs: (params: {
    page?: number;
    pageSize?: number;
    actorUserId?: number;
    resourceType?: string;
    action?: string;
    from?: string;
    to?: string;
  }) => apiRequest<AuditSearchResponse>(`/audit/logs?${buildQuery(params)}`),

  exportCsv: async (params: {
    actorUserId?: number;
    resourceType?: string;
    action?: string;
    from?: string;
    to?: string;
  }) => {
    const baseUrl =
      (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:4000";
    const query = buildQuery({ ...params, pageSize: 10000 });
    const response = await fetch(`${baseUrl}/audit/logs/export?${query}`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to export audit logs.");
    return response.text();
  },

  verifyChain: () =>
    apiRequest<AuditChainResult>("/audit/logs/verify-chain"),
};
