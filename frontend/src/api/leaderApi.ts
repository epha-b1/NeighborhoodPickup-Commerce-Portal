import { apiRequest } from './client';
import type { LeaderApplicationRecord, LeaderDashboardMetrics } from '../types/leaders';

export const leaderApi = {
  createApplication: (payload: {
    fullName: string;
    phone: string;
    experienceSummary: string;
    pickupPointId?: number;
    requestedCommissionEligible: boolean;
  }) =>
    apiRequest<LeaderApplicationRecord>('/leaders/applications', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getMyApplication: () =>
    apiRequest<{ data: LeaderApplicationRecord | null }>('/leaders/applications/me'),

  getPendingApplications: () =>
    apiRequest<{ data: LeaderApplicationRecord[] }>('/admin/leaders/applications/pending'),

  decideApplication: (
    applicationId: number,
    payload: { decision: 'APPROVE' | 'REJECT'; reason: string; commissionEligible: boolean }
  ) =>
    apiRequest<{
      id: number;
      leaderApplicationId: number;
      decision: 'APPROVED' | 'REJECTED';
      reason: string;
    }>(`/admin/leaders/applications/${applicationId}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getDashboardMetrics: (params?: { dateFrom?: string; dateTo?: string }) => {
    const query = new URLSearchParams();
    if (params?.dateFrom) {
      query.set('dateFrom', params.dateFrom);
    }
    if (params?.dateTo) {
      query.set('dateTo', params.dateTo);
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<LeaderDashboardMetrics>(`/leaders/dashboard/metrics${suffix}`);
  }
};
