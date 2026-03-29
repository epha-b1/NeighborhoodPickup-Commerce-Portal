import {
  createLeaderApplication,
  decideLeaderApplication,
  getLatestApplicationByUserId,
  getLeaderDashboardMetrics,
  listPendingApplications
} from '../repositories/leaderRepository';
import type { CreateLeaderApplicationInput, LeaderDecisionInput } from '../types';
import { recordAuditLog } from '../../audit/services/auditService';

const asUtcDate = (value: Date): string => value.toISOString().slice(0, 10);

export const submitLeaderApplication = async (params: {
  userId: number;
  input: CreateLeaderApplicationInput;
}) => {
  const latest = await getLatestApplicationByUserId(params.userId);
  if (latest && latest.status === 'PENDING') {
    throw new Error('LEADER_APPLICATION_ALREADY_PENDING');
  }

  return createLeaderApplication(params);
};

export const getMyLeaderApplication = async (userId: number) => {
  return getLatestApplicationByUserId(userId);
};

export const getPendingLeaderApplications = async () => {
  return listPendingApplications();
};

export const reviewLeaderApplication = async (params: {
  applicationId: number;
  adminUserId: number;
  input: LeaderDecisionInput;
}) => {
  const decision = params.input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

  const result = await decideLeaderApplication({
    applicationId: params.applicationId,
    adminUserId: params.adminUserId,
    decision,
    reason: params.input.reason,
    commissionEligible: params.input.commissionEligible
  });

  await recordAuditLog({
    actorUserId: params.adminUserId,
    action: 'APPROVAL',
    resourceType: 'LEADER_APPLICATION',
    resourceId: params.applicationId,
    metadata: {
      decision,
      reason: params.input.reason,
      commissionEligible: params.input.commissionEligible
    }
  });

  return result;
};

export const getLeaderDashboard = async (params: {
  leaderUserId: number;
  dateFrom?: string;
  dateTo?: string;
}) => {
  const dateTo = params.dateTo ?? asUtcDate(new Date());
  const startDate = new Date(`${dateTo}T00:00:00.000Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 29);
  const dateFrom = params.dateFrom ?? asUtcDate(startDate);

  return getLeaderDashboardMetrics({
    leaderUserId: params.leaderUserId,
    dateFrom,
    dateTo
  });
};
