import express from "express";
import request from "supertest";

import { financeRouter } from "../../src/features/finance/routes/financeRoutes";
import * as financeService from "../../src/features/finance/services/financeService";

vi.mock("../../src/features/finance/services/financeService", () => ({
  addOrReplaceBlacklist: vi.fn(),
  getCommissionSummary: vi.fn(),
  getReconciliationCsv: vi.fn(),
  getWithdrawalBlacklist: vi.fn(),
  getWithdrawalEligibility: vi.fn(),
  patchBlacklistEntry: vi.fn(),
  removeBlacklistEntry: vi.fn(),
  requestWithdrawal: vi.fn(),
}));

const mockedFinanceService = vi.mocked(financeService);

describe("finance routes", () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const roleHeader = req.header("x-role");
      const roles = roleHeader ? roleHeader.split(",") : [];

      if (roles.length > 0) {
        req.auth = {
          userId: Number(req.header("x-user-id") ?? "1"),
          username: "test-user",
          roles: roles as any,
          tokenHash: "test-hash",
        };
      }

      next();
    });
    app.use(financeRouter);
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects members from withdrawal eligibility endpoints", async () => {
    const app = buildApp();

    const response = await request(app)
      .get("/finance/withdrawals/eligibility")
      .set("x-role", "MEMBER");

    expect(response.status).toBe(403);
    expect(mockedFinanceService.getWithdrawalEligibility).not.toHaveBeenCalled();
  });

  it("allows group leaders to request their own withdrawal eligibility", async () => {
    mockedFinanceService.getWithdrawalEligibility.mockResolvedValue({
      leaderUserId: 8,
      blacklisted: false,
      remainingDailyAmount: 500,
      remainingWeeklyCount: 2,
      eligible: true,
      reason: null,
    });

    const app = buildApp();

    const response = await request(app)
      .get("/finance/withdrawals/eligibility")
      .set("x-role", "GROUP_LEADER")
      .set("x-user-id", "8");

    expect(response.status).toBe(200);
    expect(mockedFinanceService.getWithdrawalEligibility).toHaveBeenCalledWith(8);
  });

  it("rejects member withdrawal creation before hitting the service", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/finance/withdrawals")
      .set("x-role", "MEMBER")
      .send({ amount: 25 });

    expect(response.status).toBe(403);
    expect(mockedFinanceService.requestWithdrawal).not.toHaveBeenCalled();
  });
});
