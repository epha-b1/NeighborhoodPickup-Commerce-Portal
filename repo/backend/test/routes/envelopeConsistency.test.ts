import express from "express";
import request from "supertest";

import { auditRouter } from "../../src/features/audit/routes/auditRoutes";
import { behaviorRouter } from "../../src/features/behavior/routes/behaviorRoutes";
import * as auditService from "../../src/features/audit/services/auditService";
import * as behaviorService from "../../src/features/behavior/services/behaviorService";

vi.mock("../../src/features/audit/services/auditService", () => ({
  getAuditSearch: vi.fn(),
  getAuditExportCsv: vi.fn(),
  verifyAuditChain: vi.fn(),
}));
vi.mock("../../src/features/behavior/services/behaviorService", () => ({
  getBehaviorSummary: vi.fn(),
  getRetentionStatus: vi.fn(),
  ingestBehaviorEvents: vi.fn(),
  runRetentionJobs: vi.fn(),
}));

const mockedAuditService = vi.mocked(auditService);
const mockedBehaviorService = vi.mocked(behaviorService);

const buildApp = (...routers: express.Router[]) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const roleHeader = req.header("x-role");
    if (roleHeader) {
      req.auth = {
        userId: Number(req.header("x-user-id") ?? "1"),
        username: "test-user",
        roles: roleHeader.split(",") as any,
        tokenHash: "test-hash",
      };
    }
    next();
  });
  for (const router of routers) {
    app.use(router);
  }
  return app;
};

describe("envelope consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("audit search returns standard success envelope", async () => {
    mockedAuditService.getAuditSearch.mockResolvedValue({
      total: 0,
      rows: [],
    });

    const app = buildApp(auditRouter);

    const response = await request(app)
      .get("/audit/logs?page=1&pageSize=20")
      .set("x-role", "ADMINISTRATOR");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
  });

  it("audit verify-chain returns standard success envelope", async () => {
    mockedAuditService.verifyAuditChain.mockResolvedValue({
      valid: true,
      errors: [],
    });

    const app = buildApp(auditRouter);

    const response = await request(app)
      .get("/audit/logs/verify-chain")
      .set("x-role", "ADMINISTRATOR");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({ valid: true, errors: [] });
  });

  it("behavior summary returns standard success envelope", async () => {
    mockedBehaviorService.getBehaviorSummary.mockResolvedValue([
      { eventType: "CLICK", eventCount: 5 },
    ]);

    const app = buildApp(behaviorRouter);

    const response = await request(app)
      .get("/behavior/summary")
      .set("x-role", "ADMINISTRATOR");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([
      { eventType: "CLICK", eventCount: 5 },
    ]);
  });

  it("behavior retention-status returns standard success envelope", async () => {
    mockedBehaviorService.getRetentionStatus.mockResolvedValue({
      hotCount: 10,
      archiveCount: 20,
      queuePending: 0,
    });

    const app = buildApp(behaviorRouter);

    const response = await request(app)
      .get("/admin/jobs/retention-status")
      .set("x-role", "ADMINISTRATOR");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({
      hotCount: 10,
      archiveCount: 20,
      queuePending: 0,
    });
  });

  it("behavior ingest returns 202 with standard success envelope", async () => {
    mockedBehaviorService.ingestBehaviorEvents.mockResolvedValue({
      accepted: 1,
      duplicates: 0,
    });

    const app = buildApp(behaviorRouter);

    const response = await request(app)
      .post("/behavior/events")
      .set("x-role", "MEMBER")
      .send({
        events: [
          {
            idempotencyKey: "envelope-test-001",
            eventType: "CLICK",
            resourceType: "LISTING",
            resourceId: "9",
          },
        ],
      });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({ accepted: 1, duplicates: 0 });
  });
});
