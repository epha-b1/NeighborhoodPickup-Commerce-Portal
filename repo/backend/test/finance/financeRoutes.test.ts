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
    expect(response.body.success).toBe(true);
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

  // --- Blacklist CRUD route tests ---

  it("rejects non-admin access to blacklist listing", async () => {
    const app = buildApp();

    const response = await request(app)
      .get("/admin/withdrawal-blacklist")
      .set("x-role", "FINANCE_CLERK");

    expect(response.status).toBe(403);
    expect(mockedFinanceService.getWithdrawalBlacklist).not.toHaveBeenCalled();
  });

  it("allows administrators to list blacklist entries", async () => {
    mockedFinanceService.getWithdrawalBlacklist.mockResolvedValue([
      { id: 1, userId: 10, reason: "Suspicious", active: true, createdByUserId: 1, updatedAt: "2026-04-01T00:00:00Z" },
    ]);

    const app = buildApp();

    const response = await request(app)
      .get("/admin/withdrawal-blacklist")
      .set("x-role", "ADMINISTRATOR");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
  });

  it("allows administrators to create blacklist entries", async () => {
    mockedFinanceService.addOrReplaceBlacklist.mockResolvedValue(undefined);

    const app = buildApp();

    const response = await request(app)
      .post("/admin/withdrawal-blacklist")
      .set("x-role", "ADMINISTRATOR")
      .set("x-user-id", "1")
      .send({ userId: 20, reason: "Suspicious activity", active: true });

    expect(response.status).toBe(201);
    expect(mockedFinanceService.addOrReplaceBlacklist).toHaveBeenCalledWith({
      userId: 20,
      reason: "Suspicious activity",
      active: true,
      createdByUserId: 1,
    });
  });

  it("allows administrators to patch blacklist entries", async () => {
    mockedFinanceService.patchBlacklistEntry.mockResolvedValue(true);

    const app = buildApp();

    const response = await request(app)
      .patch("/admin/withdrawal-blacklist/5")
      .set("x-role", "ADMINISTRATOR")
      .set("x-user-id", "1")
      .send({ reason: "Updated reason", active: false });

    expect(response.status).toBe(200);
    expect(mockedFinanceService.patchBlacklistEntry).toHaveBeenCalledWith({
      id: 5,
      reason: "Updated reason",
      active: false,
      actorUserId: 1,
    });
  });

  it("returns 404 when patching non-existent blacklist entry", async () => {
    mockedFinanceService.patchBlacklistEntry.mockResolvedValue(false);

    const app = buildApp();

    const response = await request(app)
      .patch("/admin/withdrawal-blacklist/999")
      .set("x-role", "ADMINISTRATOR")
      .set("x-user-id", "1")
      .send({ reason: "Nope" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("BLACKLIST_NOT_FOUND");
  });

  it("allows administrators to delete blacklist entries", async () => {
    mockedFinanceService.removeBlacklistEntry.mockResolvedValue(true);

    const app = buildApp();

    const response = await request(app)
      .delete("/admin/withdrawal-blacklist/5")
      .set("x-role", "ADMINISTRATOR")
      .set("x-user-id", "1");

    expect(response.status).toBe(204);
    expect(mockedFinanceService.removeBlacklistEntry).toHaveBeenCalledWith({
      id: 5,
      actorUserId: 1,
    });
  });

  it("returns 404 when deleting non-existent blacklist entry", async () => {
    mockedFinanceService.removeBlacklistEntry.mockResolvedValue(false);

    const app = buildApp();

    const response = await request(app)
      .delete("/admin/withdrawal-blacklist/999")
      .set("x-role", "ADMINISTRATOR")
      .set("x-user-id", "1");

    expect(response.status).toBe(404);
  });

  // --- CSV export route tests ---

  it("rejects non-finance roles from reconciliation CSV export", async () => {
    const app = buildApp();

    const response = await request(app)
      .get("/finance/reconciliation/export?dateFrom=2026-03-01&dateTo=2026-03-31")
      .set("x-role", "MEMBER");

    expect(response.status).toBe(403);
    expect(mockedFinanceService.getReconciliationCsv).not.toHaveBeenCalled();
  });

  it("allows finance clerks to export reconciliation CSV", async () => {
    mockedFinanceService.getReconciliationCsv.mockResolvedValue({
      fileName: "reconciliation-2026-03-01-to-2026-03-31.csv",
      csv: "order_id,pickup_point_id,member_user_id,settled_amount,status,posted_at\n1,2,3,29.13,POSTED,2026-04-01T10:00:00Z",
      rowCount: 1,
    });

    const app = buildApp();

    const response = await request(app)
      .get("/finance/reconciliation/export?dateFrom=2026-03-01&dateTo=2026-03-31")
      .set("x-role", "FINANCE_CLERK")
      .set("x-user-id", "5");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("reconciliation-2026-03-01-to-2026-03-31.csv");
    expect(response.text).toContain("order_id");
  });

  // --- Commission route tests ---

  it("rejects members from commission summary endpoint", async () => {
    const app = buildApp();

    const response = await request(app)
      .get("/finance/commissions")
      .set("x-role", "MEMBER");

    expect(response.status).toBe(403);
    expect(mockedFinanceService.getCommissionSummary).not.toHaveBeenCalled();
  });

  it("allows finance clerks to retrieve commission summary", async () => {
    mockedFinanceService.getCommissionSummary.mockResolvedValue([
      { leaderUserId: 10, pickupPointId: 3, preTaxItemTotal: 200, commissionRate: 0.06, commissionAmount: 12 },
    ]);

    const app = buildApp();

    const response = await request(app)
      .get("/finance/commissions?dateFrom=2026-03-01&dateTo=2026-03-31")
      .set("x-role", "FINANCE_CLERK");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
  });
});
