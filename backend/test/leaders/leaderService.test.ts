import * as auditService from "../../src/features/audit/services/auditService";
import * as repo from "../../src/features/leaders/repositories/leaderRepository";
import {
  getLeaderDashboard,
  reviewLeaderApplication,
  submitLeaderApplication,
} from "../../src/features/leaders/services/leaderService";

vi.mock("../../src/features/leaders/repositories/leaderRepository");
vi.mock("../../src/features/audit/services/auditService", () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockedRepo = vi.mocked(repo);
const mockedAuditService = vi.mocked(auditService);

describe("leader service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks duplicate pending onboarding applications", async () => {
    mockedRepo.getLatestApplicationByUserId.mockResolvedValue({
      id: 91,
      userId: 4,
      status: "PENDING",
      fullName: "Leader User",
      phone: "555-1000",
      experienceSummary: "Already pending",
      pickupPointId: 2,
      requestedCommissionEligible: true,
      decisionCommissionEligible: null,
      decisionReason: null,
      submittedAt: "2026-01-10T10:00:00.000Z",
      reviewedAt: null,
      decisionByAdminId: null,
      decisionByAdminUsername: null,
      decisionAt: null,
    });

    await expect(
      submitLeaderApplication({
        userId: 4,
        input: {
          fullName: "Leader User",
          phone: "555-1000",
          experienceSummary:
            "I have managed recurring community pickup operations for years.",
          pickupPointId: 2,
          requestedCommissionEligible: true,
        },
      }),
    ).rejects.toThrow("LEADER_APPLICATION_ALREADY_PENDING");

    expect(mockedRepo.createLeaderApplication).not.toHaveBeenCalled();
  });

  it("records the admin decision audit event when reviewing an application", async () => {
    mockedRepo.decideLeaderApplication.mockResolvedValue({
      id: 12,
      leaderApplicationId: 12,
      decision: "APPROVED",
      reason: "All checks passed.",
    });

    const result = await reviewLeaderApplication({
      applicationId: 12,
      adminUserId: 99,
      input: {
        decision: "APPROVE",
        reason: "All checks passed.",
        commissionEligible: true,
      },
    });

    expect(mockedRepo.decideLeaderApplication).toHaveBeenCalledWith({
      applicationId: 12,
      adminUserId: 99,
      decision: "APPROVED",
      reason: "All checks passed.",
      commissionEligible: true,
    });
    expect(mockedAuditService.recordAuditLog).toHaveBeenCalledWith({
      actorUserId: 99,
      action: "APPROVAL",
      resourceType: "LEADER_APPLICATION",
      resourceId: 12,
      metadata: {
        decision: "APPROVED",
        reason: "All checks passed.",
        commissionEligible: true,
      },
    });
    expect(result).toEqual({
      id: 12,
      leaderApplicationId: 12,
      decision: "APPROVED",
      reason: "All checks passed.",
    });
  });

  it("defaults the dashboard window to the last 30 days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T09:30:00.000Z"));

    mockedRepo.getLeaderDashboardMetrics.mockResolvedValue({
      leaderId: 7,
      windowStartDate: "2026-02-28",
      windowEndDate: "2026-03-29",
      orderVolume: 14,
      fulfillmentRate: 97.1,
      feedbackTrend: {
        latest7DayAverage: 4.8,
        previous7DayAverage: 4.6,
        direction: "UP",
      },
      daily: [],
    });

    await getLeaderDashboard({ leaderUserId: 7 });

    expect(mockedRepo.getLeaderDashboardMetrics).toHaveBeenCalledWith({
      leaderUserId: 7,
      dateFrom: "2026-02-28",
      dateTo: "2026-03-29",
    });

    vi.useRealTimers();
  });
});
