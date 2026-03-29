export type CommissionRow = {
  leaderUserId: number;
  pickupPointId: number;
  preTaxItemTotal: number;
  commissionRate: number;
  commissionAmount: number;
};

export type WithdrawalEligibility = {
  leaderUserId: number;
  blacklisted: boolean;
  remainingDailyAmount: number;
  remainingWeeklyCount: number;
  eligible: boolean;
  reason: string | null;
};

export type WithdrawalRecord = {
  id: number;
  leaderUserId: number;
  requestedAmount: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedAt: string;
  decidedAt: string | null;
  decidedByUserId: number | null;
  decisionNote: string | null;
};

export type BlacklistRecord = {
  id: number;
  userId: number;
  reason: string;
  active: boolean;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
};
