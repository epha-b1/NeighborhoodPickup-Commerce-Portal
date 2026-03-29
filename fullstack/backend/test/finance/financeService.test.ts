import {
  getCommissionSummary,
  getWithdrawalEligibility,
  requestWithdrawal,
} from "../../src/features/finance/services/financeService";
import * as repo from "../../src/features/finance/repositories/financeRepository";
import * as leaderRepo from "../../src/features/leaders/repositories/leaderRepository";

vi.mock("../../src/features/finance/repositories/financeRepository");
vi.mock("../../src/features/leaders/repositories/leaderRepository");

const mockedRepo = vi.mocked(repo);
const mockedLeaderRepo = vi.mocked(leaderRepo);

describe("finance service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses override commission rate when available", async () => {
    mockedRepo.getOrderCommissionBases.mockResolvedValue([
      {
        leaderUserId: 8,
        pickupPointId: 2,
        preTaxItemTotal: 100,
      },
    ]);
    mockedRepo.getLeaderCommissionRate.mockResolvedValue(0.08);

    const rows = await getCommissionSummary({});

    expect(rows[0]).toEqual({
      leaderUserId: 8,
      pickupPointId: 2,
      preTaxItemTotal: 100,
      commissionRate: 0.08,
      commissionAmount: 8,
    });
  });

  it("blocks eligibility when blacklisted", async () => {
    mockedLeaderRepo.getLeaderByUserId.mockResolvedValue({
      id: 5,
      user_id: 20,
      status: "APPROVED",
      commission_eligible: 1,
    });
    mockedRepo.isLeaderBlacklisted.mockResolvedValue(true);

    const eligibility = await getWithdrawalEligibility(20);

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blacklisted).toBe(true);
  });

  it("rejects withdrawals for users without an approved leader record", async () => {
    mockedLeaderRepo.getLeaderByUserId.mockResolvedValue(null);

    await expect(getWithdrawalEligibility(44)).rejects.toThrow(
      "LEADER_NOT_ELIGIBLE_FOR_WITHDRAWAL",
    );
  });

  it("enforces daily limit on withdrawal request", async () => {
    mockedLeaderRepo.getLeaderByUserId.mockResolvedValue({
      id: 7,
      user_id: 7,
      status: "APPROVED",
      commission_eligible: 1,
    });
    mockedRepo.isLeaderBlacklisted.mockResolvedValue(false);
    mockedRepo.getWithdrawalWindowUsage.mockResolvedValue({
      todayAmount: 490,
      weekCount: 0,
    });

    await expect(
      requestWithdrawal({
        leaderUserId: 7,
        amount: 20,
        requestedByUserId: 3,
      }),
    ).rejects.toThrow("WITHDRAWAL_DAILY_LIMIT_EXCEEDED");
  });
});
