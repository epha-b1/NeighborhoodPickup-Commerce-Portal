export type LeaderApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type LeaderApplicationRecord = {
  id: number;
  userId: number;
  fullName: string;
  phone: string;
  experienceSummary: string;
  governmentIdLast4: string | null;
  certificationName: string | null;
  certificationIssuer: string | null;
  yearsOfExperience: number | null;
  pickupPointId: number | null;
  requestedCommissionEligible: boolean;
  status: LeaderApplicationStatus;
  submittedAt: string;
  reviewedAt: string | null;
  decisionReason: string | null;
  decisionByAdminId: number | null;
  decisionByAdminUsername: string | null;
  decisionCommissionEligible: boolean | null;
  decisionAt: string | null;
};

export type LeaderApplicationDecision = {
  id: number;
  leaderApplicationId: number;
  adminUserId: number;
  adminUsername: string;
  decision: 'APPROVED' | 'REJECTED';
  reason: string;
  commissionEligible: boolean;
  createdAt: string;
};

export type LeaderDashboardMetrics = {
  leaderId: number;
  windowStartDate: string;
  windowEndDate: string;
  orderVolume: number;
  fulfillmentRate: number;
  feedbackTrend: {
    latest7DayAverage: number | null;
    previous7DayAverage: number | null;
    direction: 'UP' | 'DOWN' | 'FLAT' | 'NO_DATA';
  };
  daily: Array<{
    metricDate: string;
    orderVolume: number;
    fulfillmentRate: number;
    feedbackScoreAvg: number | null;
    feedbackCount: number;
  }>;
};

export type CreateLeaderApplicationInput = {
  fullName: string;
  phone: string;
  experienceSummary: string;
  governmentIdLast4?: string;
  certificationName?: string;
  certificationIssuer?: string;
  yearsOfExperience?: number;
  pickupPointId?: number;
  requestedCommissionEligible: boolean;
};

export type LeaderDecisionInput = {
  decision: 'APPROVE' | 'REJECT';
  reason: string;
  commissionEligible: boolean;
};
