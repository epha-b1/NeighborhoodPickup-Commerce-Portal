import express from "express";
import request from "supertest";

import { appealRouter } from "../../src/features/appeals/routes/appealRoutes";
import { auditRouter } from "../../src/features/audit/routes/auditRoutes";
import { discussionRouter } from "../../src/features/discussions/routes/discussionRoutes";
import * as appealService from "../../src/features/appeals/services/appealService";
import * as auditService from "../../src/features/audit/services/auditService";
import * as discussionService from "../../src/features/discussions/services/discussionService";

vi.mock("../../src/features/appeals/services/appealService", () => ({
  createAppealRecord: vi.fn(),
  getAppealDetail: vi.fn(),
  getAppealTimeline: vi.fn(),
  listAppealQueue: vi.fn(),
  transitionAppealStatus: vi.fn(),
  uploadAppealFiles: vi.fn(),
}));

vi.mock("../../src/features/discussions/services/discussionService", () => ({
  createThreadComment: vi.fn(),
  flagComment: vi.fn(),
  getThreadComments: vi.fn(),
  listUserNotifications: vi.fn(),
  patchNotificationReadState: vi.fn(),
}));

vi.mock("../../src/features/audit/services/auditService", () => ({
  getAuditExportCsv: vi.fn(),
  getAuditSearch: vi.fn(),
  verifyAuditChain: vi.fn(),
}));

const mockedAppealService = vi.mocked(appealService);
const mockedDiscussionService = vi.mocked(discussionService);
const mockedAuditService = vi.mocked(auditService);

describe("route authorization matrix", () => {
  const withAuth = () => {
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
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication for appeal listing", async () => {
    const app = withAuth();
    app.use(appealRouter);

    const response = await request(app).get("/appeals");

    expect(response.status).toBe(401);
    expect(mockedAppealService.listAppealQueue).not.toHaveBeenCalled();
  });

  it("rejects appeal status transitions for non-review roles", async () => {
    mockedAppealService.transitionAppealStatus.mockRejectedValue(
      new Error("APPEAL_STATUS_FORBIDDEN"),
    );

    const app = withAuth();
    app.use(appealRouter);

    const response = await request(app)
      .patch("/appeals/44/status")
      .set("x-role", "MEMBER")
      .send({ toStatus: "INVESTIGATION", note: "Need escalation" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("APPEAL_STATUS_FORBIDDEN");
  });

  it("allows reviewer appeal status transitions", async () => {
    mockedAppealService.transitionAppealStatus.mockResolvedValue({
      appealId: 44,
      fromStatus: "INTAKE",
      toStatus: "INVESTIGATION",
    });

    const app = withAuth();
    app.use(appealRouter);

    const response = await request(app)
      .patch("/appeals/44/status")
      .set("x-role", "REVIEWER")
      .send({ toStatus: "INVESTIGATION", note: "Accepted for investigation" });

    expect(response.status).toBe(200);
    expect(mockedAppealService.transitionAppealStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        fromUserRoles: ["REVIEWER"],
      }),
    );
  });

  it("requires authentication for discussion threads", async () => {
    const app = withAuth();
    app.use(discussionRouter);

    const response = await request(app).get("/threads/7/comments");

    expect(response.status).toBe(401);
    expect(mockedDiscussionService.getThreadComments).not.toHaveBeenCalled();
  });

  it("returns forbidden when the discussion service blocks thread access", async () => {
    mockedDiscussionService.getThreadComments.mockRejectedValue(
      new Error("THREAD_FORBIDDEN"),
    );

    const app = withAuth();
    app.use(discussionRouter);

    const response = await request(app)
      .get("/threads/7/comments")
      .set("x-role", "GROUP_LEADER");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("THREAD_FORBIDDEN");
  });

  it("allows authenticated discussion thread access", async () => {
    mockedDiscussionService.getThreadComments.mockResolvedValue({
      discussionId: 7,
      contextType: "LISTING",
      contextId: 11,
      total: 0,
      comments: [],
    });

    const app = withAuth();
    app.use(discussionRouter);

    const response = await request(app)
      .get("/threads/7/comments")
      .set("x-role", "MEMBER");

    expect(response.status).toBe(200);
    expect(response.body.discussionId).toBe(7);
  });

  it("requires administrator role for audit search", async () => {
    const app = withAuth();
    app.use(auditRouter);

    const anonymous = await request(app).get("/audit/logs");
    expect(anonymous.status).toBe(401);

    const wrongRole = await request(app)
      .get("/audit/logs")
      .set("x-role", "REVIEWER");
    expect(wrongRole.status).toBe(403);

    expect(mockedAuditService.getAuditSearch).not.toHaveBeenCalled();
  });

  it("allows administrators to search and export audit logs", async () => {
    mockedAuditService.getAuditSearch.mockResolvedValue({
      total: 1,
      rows: [
        {
          id: 1,
          actorUserId: 9,
          action: "APPROVAL",
          resourceType: "LEADER_APPLICATION",
          resourceId: "77",
          metadata: null,
          hashBasis: "{}",
          previousHash: null,
          currentHash: "hash-1",
          createdAt: "2026-03-29T08:00:00.000Z",
        },
      ],
    });
    mockedAuditService.getAuditExportCsv.mockResolvedValue(
      "id,actor_user_id\n1,9",
    );

    const app = withAuth();
    app.use(auditRouter);

    const searchResponse = await request(app)
      .get("/audit/logs?page=1&pageSize=20")
      .set("x-role", "ADMINISTRATOR");

    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.total).toBe(1);

    const exportResponse = await request(app)
      .get("/audit/logs/export?page=1&pageSize=20")
      .set("x-role", "ADMINISTRATOR");

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    expect(exportResponse.text).toContain("id,actor_user_id");
  });
});
