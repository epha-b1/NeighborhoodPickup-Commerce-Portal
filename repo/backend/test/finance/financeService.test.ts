import {
  addOrReplaceBlacklist,
  getCommissionSummary,
  getReconciliationCsv,
  getWithdrawalBlacklist,
  getWithdrawalEligibility,
  patchBlacklistEntry,
  removeBlacklistEntry,
  requestWithdrawal,
} from "../../src/features/finance/services/financeService";
import * as repo from "../../src/features/finance/repositories/financeRepository";
import * as leaderRepo from "../../src/features/leaders/repositories/leaderRepository";

vi.mock("../../src/features/finance/repositories/financeRepository");
vi.mock("../../src/features/leaders/repositories/leaderRepository");
vi.mock("../../src/features/audit/services/auditService", () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

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

  it("excludes non-commission-eligible leaders from commission summary", async () => {
    // When the repository returns no bases (because the query filters by commission_eligible=1),
    // the commission summary should return an empty array for non-eligible leaders.
    mockedRepo.getOrderCommissionBases.mockResolvedValue([]);

    const rows = await getCommissionSummary({});

    expect(rows).toEqual([]);
    expect(mockedRepo.getOrderCommissionBases).toHaveBeenCalledWith({});
  });

  it("includes only commission-eligible leaders in commission summary", async () => {
    // The repository query now JOINs leaders table with commission_eligible=1,
    // so only eligible leaders' orders appear in the bases.
    mockedRepo.getOrderCommissionBases.mockResolvedValue([
      { leaderUserId: 10, pickupPointId: 3, preTaxItemTotal: 200 },
    ]);
    mockedRepo.getLeaderCommissionRate.mockResolvedValue(null);

    const rows = await getCommissionSummary({ dateFrom: "2026-03-01", dateTo: "2026-03-31" });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      leaderUserId: 10,
      pickupPointId: 3,
      preTaxItemTotal: 200,
      commissionRate: 0.06,
      commissionAmount: 12,
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

  it("blocks eligibility when leader is not commission-eligible", async () => {
    mockedLeaderRepo.getLeaderByUserId.mockResolvedValue({
      id: 5,
      user_id: 20,
      status: "APPROVED",
      commission_eligible: 0,
    });

    await expect(getWithdrawalEligibility(20)).rejects.toThrow(
      "LEADER_NOT_COMMISSION_ELIGIBLE",
    );
  });

  it("blocks withdrawal when leader is approved but not commission-eligible", async () => {
    mockedLeaderRepo.getLeaderByUserId.mockResolvedValue({
      id: 7,
      user_id: 7,
      status: "APPROVED",
      commission_eligible: 0,
    });

    await expect(
      requestWithdrawal({
        leaderUserId: 7,
        amount: 50,
        requestedByUserId: 3,
      }),
    ).rejects.toThrow("LEADER_NOT_COMMISSION_ELIGIBLE");
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

  it("enforces weekly withdrawal count cap of 2", async () => {
    mockedLeaderRepo.getLeaderByUserId.mockResolvedValue({
      id: 7,
      user_id: 7,
      status: "APPROVED",
      commission_eligible: 1,
    });
    mockedRepo.isLeaderBlacklisted.mockResolvedValue(false);
    mockedRepo.getWithdrawalWindowUsage.mockResolvedValue({
      todayAmount: 0,
      weekCount: 2,
    });

    const eligibility = await getWithdrawalEligibility(7);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.remainingWeeklyCount).toBe(0);
    expect(eligibility.reason).toBe("Weekly withdrawal count reached.");
  });

  it("reports remaining weekly count when partially used", async () => {
    mockedLeaderRepo.getLeaderByUserId.mockResolvedValue({
      id: 7,
      user_id: 7,
      status: "APPROVED",
      commission_eligible: 1,
    });
    mockedRepo.isLeaderBlacklisted.mockResolvedValue(false);
    mockedRepo.getWithdrawalWindowUsage.mockResolvedValue({
      todayAmount: 100,
      weekCount: 1,
    });

    const eligibility = await getWithdrawalEligibility(7);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.remainingWeeklyCount).toBe(1);
    expect(eligibility.remainingDailyAmount).toBe(400);
  });

  it("rejects withdrawal when weekly cap is exhausted", async () => {
    mockedLeaderRepo.getLeaderByUserId.mockResolvedValue({
      id: 7,
      user_id: 7,
      status: "APPROVED",
      commission_eligible: 1,
    });
    mockedRepo.isLeaderBlacklisted.mockResolvedValue(false);
    mockedRepo.getWithdrawalWindowUsage.mockResolvedValue({
      todayAmount: 0,
      weekCount: 2,
    });

    await expect(
      requestWithdrawal({
        leaderUserId: 7,
        amount: 50,
        requestedByUserId: 3,
      }),
    ).rejects.toThrow("WITHDRAWAL_NOT_ELIGIBLE");
  });

  it("rejects withdrawal with zero or negative amount", async () => {
    mockedLeaderRepo.getLeaderByUserId.mockResolvedValue({
      id: 7,
      user_id: 7,
      status: "APPROVED",
      commission_eligible: 1,
    });

    await expect(
      requestWithdrawal({
        leaderUserId: 7,
        amount: 0,
        requestedByUserId: 3,
      }),
    ).rejects.toThrow("INVALID_WITHDRAWAL_AMOUNT");
  });
});

describe("finance service – blacklist CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds a blacklist entry and records audit log", async () => {
    mockedRepo.upsertBlacklistEntry.mockResolvedValue();

    await addOrReplaceBlacklist({
      userId: 20,
      reason: "Suspicious withdrawal pattern",
      active: true,
      createdByUserId: 1,
    });

    expect(mockedRepo.upsertBlacklistEntry).toHaveBeenCalledWith({
      userId: 20,
      reason: "Suspicious withdrawal pattern",
      active: true,
      createdByUserId: 1,
    });
  });

  it("patches a blacklist entry and records audit log on success", async () => {
    mockedRepo.updateBlacklistEntry.mockResolvedValue(true);

    const result = await patchBlacklistEntry({
      id: 5,
      reason: "Updated reason",
      active: false,
      actorUserId: 1,
    });

    expect(result).toBe(true);
    expect(mockedRepo.updateBlacklistEntry).toHaveBeenCalledWith({
      id: 5,
      reason: "Updated reason",
      active: false,
      actorUserId: 1,
    });
  });

  it("returns false when patching non-existent blacklist entry", async () => {
    mockedRepo.updateBlacklistEntry.mockResolvedValue(false);

    const result = await patchBlacklistEntry({
      id: 999,
      reason: "Does not exist",
      actorUserId: 1,
    });

    expect(result).toBe(false);
  });

  it("removes a blacklist entry and records audit log", async () => {
    mockedRepo.deleteBlacklistEntry.mockResolvedValue(true);

    const result = await removeBlacklistEntry({ id: 5, actorUserId: 1 });

    expect(result).toBe(true);
    expect(mockedRepo.deleteBlacklistEntry).toHaveBeenCalledWith(5);
  });

  it("returns false when removing non-existent blacklist entry", async () => {
    mockedRepo.deleteBlacklistEntry.mockResolvedValue(false);

    const result = await removeBlacklistEntry({ id: 999, actorUserId: 1 });

    expect(result).toBe(false);
  });

  it("lists all blacklist entries", async () => {
    mockedRepo.listBlacklist.mockResolvedValue([
      { id: 1, userId: 10, reason: "Test", active: true, createdByUserId: 1, updatedAt: "2026-04-01T00:00:00Z" },
    ]);

    const result = await getWithdrawalBlacklist();

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(10);
    expect(mockedRepo.listBlacklist).toHaveBeenCalledTimes(1);
  });
});

describe("finance service – CSV export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates correct CSV with header and data rows", async () => {
    mockedRepo.getSettlementRowsForExport.mockResolvedValue([
      {
        orderId: 1,
        pickupPointId: 2,
        memberUserId: 3,
        settledAmount: 29.13,
        settlementStatus: "POSTED",
        postedAt: "2026-04-01T10:00:00Z",
      },
    ]);
    mockedRepo.createReconciliationExportJob.mockResolvedValue();

    const result = await getReconciliationCsv({
      requestedByUserId: 1,
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
    });

    expect(result.rowCount).toBe(1);
    expect(result.fileName).toBe("reconciliation-2026-03-01-to-2026-03-31.csv");
    const lines = result.csv.split("\n");
    expect(lines[0]).toBe("order_id,pickup_point_id,member_user_id,settled_amount,status,posted_at");
    expect(lines[1]).toBe("1,2,3,29.13,POSTED,2026-04-01T10:00:00Z");
  });

  it("escapes CSV fields containing commas and quotes", async () => {
    mockedRepo.getSettlementRowsForExport.mockResolvedValue([
      {
        orderId: 1,
        pickupPointId: 2,
        memberUserId: 3,
        settledAmount: 10.5,
        settlementStatus: 'POSTED, "confirmed"',
        postedAt: "2026-04-01T10:00:00Z",
      },
    ]);
    mockedRepo.createReconciliationExportJob.mockResolvedValue();

    const result = await getReconciliationCsv({
      requestedByUserId: 1,
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
    });

    const lines = result.csv.split("\n");
    expect(lines[1]).toContain('"POSTED, ""confirmed"""');
  });

  it("returns empty CSV body when no settlement rows exist", async () => {
    mockedRepo.getSettlementRowsForExport.mockResolvedValue([]);
    mockedRepo.createReconciliationExportJob.mockResolvedValue();

    const result = await getReconciliationCsv({
      requestedByUserId: 1,
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    });

    expect(result.rowCount).toBe(0);
    const lines = result.csv.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("order_id");
  });
});
