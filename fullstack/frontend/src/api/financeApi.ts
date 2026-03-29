import { apiRequest } from "./client";
import type {
  BlacklistRecord,
  CommissionRow,
  WithdrawalEligibility,
  WithdrawalRecord,
} from "../types/finance";

export const financeApi = {
  getCommissions: (params?: { dateFrom?: string; dateTo?: string }) => {
    const query = new URLSearchParams();
    if (params?.dateFrom) {
      query.set("dateFrom", params.dateFrom);
    }
    if (params?.dateTo) {
      query.set("dateTo", params.dateTo);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return apiRequest<{ data: CommissionRow[] }>(
      `/finance/commissions${suffix}`,
    );
  },
  getWithdrawalEligibility: (leaderUserId?: number) => {
    const suffix = leaderUserId ? `?leaderUserId=${leaderUserId}` : "";
    return apiRequest<WithdrawalEligibility>(
      `/finance/withdrawals/eligibility${suffix}`,
    );
  },
  requestWithdrawal: (payload: { amount: number; leaderUserId?: number }) =>
    apiRequest<WithdrawalRecord>("/finance/withdrawals", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getReconciliationCsv: async (params: {
    dateFrom: string;
    dateTo: string;
  }) => {
    const query = new URLSearchParams({
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    });

    return apiRequest<string>(
      `/finance/reconciliation/export?${query.toString()}`,
    );
  },
  listBlacklist: () =>
    apiRequest<{ data: BlacklistRecord[] }>("/admin/withdrawal-blacklist"),
  upsertBlacklist: (payload: {
    userId: number;
    reason: string;
    active?: boolean;
  }) =>
    apiRequest<{ ok: true }>("/admin/withdrawal-blacklist", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  patchBlacklist: (
    id: number,
    payload: { reason?: string; active?: boolean },
  ) =>
    apiRequest<{ ok: true }>(`/admin/withdrawal-blacklist/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteBlacklist: (id: number) =>
    apiRequest<void>(`/admin/withdrawal-blacklist/${id}`, {
      method: "DELETE",
    }),
};
