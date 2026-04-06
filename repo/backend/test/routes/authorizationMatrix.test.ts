import express from "express";
import request from "supertest";

import { appealRouter } from "../../src/features/appeals/routes/appealRoutes";
import { auditRouter } from "../../src/features/audit/routes/auditRoutes";
import { commerceRouter } from "../../src/features/commerce/routes/commerceRoutes";
import { discussionRouter } from "../../src/features/discussions/routes/discussionRoutes";
import * as appealService from "../../src/features/appeals/services/appealService";
import * as auditService from "../../src/features/audit/services/auditService";
import * as commerceService from "../../src/features/commerce/services/commerceService";
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
  resolveThreadByContext: vi.fn(),
  listUserNotifications: vi.fn(),
  patchNotificationReadState: vi.fn(),
  unhideComment: vi.fn(),
}));

vi.mock("../../src/features/audit/services/auditService", () => ({
  getAuditExportCsv: vi.fn(),
  getAuditSearch: vi.fn(),
  verifyAuditChain: vi.fn(),
}));

vi.mock("../../src/features/commerce/services/commerceService", () => ({
  createPickupWindowService: vi.fn(),
  getPickupPointDetail: vi.fn(),
  listActiveBuyingCycles: vi.fn(),
  listListings: vi.fn(),
  toggleFavoriteTarget: vi.fn(),
}));

const mockedAppealService = vi.mocked(appealService);
const mockedCommerceService = vi.mocked(commerceService);
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
    expect(response.body.success).toBe(true);
    expect(response.body.data.discussionId).toBe(7);
  });

  it("returns forbidden when thread resolution is blocked by object-level access rules", async () => {
    mockedDiscussionService.resolveThreadByContext.mockRejectedValue(
      new Error("THREAD_FORBIDDEN"),
    );

    const app = withAuth();
    app.use(discussionRouter);

    const response = await request(app)
      .get("/threads/resolve?contextType=ORDER&contextId=44")
      .set("x-role", "REVIEWER");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("THREAD_FORBIDDEN");
  });

  it("resolves discussion thread id for authorized users", async () => {
    mockedDiscussionService.resolveThreadByContext.mockResolvedValue({
      discussionId: 99,
      contextType: "LISTING",
      contextId: 44,
    });

    const app = withAuth();
    app.use(discussionRouter);

    const response = await request(app)
      .get("/threads/resolve?contextType=LISTING&contextId=44")
      .set("x-role", "REVIEWER");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        discussionId: 99,
        contextType: "LISTING",
        contextId: 44,
      },
    });
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
    expect(searchResponse.body.success).toBe(true);
    expect(searchResponse.body.data.total).toBe(1);

    const exportResponse = await request(app)
      .get("/audit/logs/export?page=1&pageSize=20")
      .set("x-role", "ADMINISTRATOR");

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    expect(exportResponse.text).toContain("id,actor_user_id");
  });

  // --- Commerce route object-level authorization ---

  it("requires authentication for listings endpoint", async () => {
    const app = withAuth();
    app.use(commerceRouter);

    const response = await request(app).get("/listings?cycleId=1");

    expect(response.status).toBe(401);
    expect(mockedCommerceService.listListings).not.toHaveBeenCalled();
  });

  it("requires authentication for pickup point detail endpoint", async () => {
    const app = withAuth();
    app.use(commerceRouter);

    const response = await request(app).get("/pickup-points/5");

    expect(response.status).toBe(401);
    expect(mockedCommerceService.getPickupPointDetail).not.toHaveBeenCalled();
  });

  it("passes user context to listings service for object-level access", async () => {
    mockedCommerceService.listListings.mockResolvedValue({
      total: 1,
      rows: [
        {
          id: 9,
          cycleId: 1,
          pickupPointId: 3,
          pickupPointName: "Point A",
          leaderUserId: 7,
          leaderUsername: "leader1",
          title: "Kale",
          description: "Fresh",
          basePrice: 5.99,
          unitLabel: "bundle",
          availableQuantity: 20,
          reservedQuantity: 5,
          isFavoritePickupPoint: true,
          isFavoriteLeader: false,
        },
      ],
    });

    const app = withAuth();
    app.use(commerceRouter);

    const response = await request(app)
      .get("/listings?cycleId=1")
      .set("x-role", "MEMBER")
      .set("x-user-id", "15");

    expect(response.status).toBe(200);
    expect(mockedCommerceService.listListings).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 15 }),
    );
  });

  it("returns 404 when pickup point is not found", async () => {
    mockedCommerceService.getPickupPointDetail.mockResolvedValue(null);

    const app = withAuth();
    app.use(commerceRouter);

    const response = await request(app)
      .get("/pickup-points/999")
      .set("x-role", "MEMBER")
      .set("x-user-id", "15");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PICKUP_POINT_NOT_FOUND");
  });

  it("passes user context to pickup point detail for personalized response", async () => {
    mockedCommerceService.getPickupPointDetail.mockResolvedValue({
      id: 5,
      name: "Central Park Pickup",
      address: "123 Main St",
      businessHours: { mon: "9-5", tue: "9-5" },
      dailyCapacity: 50,
      remainingCapacityToday: 30,
      windows: [],
      isFavorite: true,
    });

    const app = withAuth();
    app.use(commerceRouter);

    const response = await request(app)
      .get("/pickup-points/5")
      .set("x-role", "MEMBER")
      .set("x-user-id", "15");

    expect(response.status).toBe(200);
    expect(mockedCommerceService.getPickupPointDetail).toHaveBeenCalledWith({
      userId: 15,
      pickupPointId: 5,
    });
    expect(response.body.data.isFavorite).toBe(true);
  });

  // --- Admin pickup window creation with 1-hour duration enforcement ---

  it("rejects non-admin from creating pickup windows", async () => {
    const app = withAuth();
    app.use(commerceRouter);

    const response = await request(app)
      .post("/admin/pickup-windows")
      .set("x-role", "MEMBER")
      .send({
        pickupPointId: 1,
        windowDate: "2026-05-01",
        startTime: "09:00:00",
        endTime: "10:00:00",
        capacityTotal: 50,
      });

    expect(response.status).toBe(403);
    expect(mockedCommerceService.createPickupWindowService).not.toHaveBeenCalled();
  });

  it("allows admin to create a valid 1-hour pickup window", async () => {
    mockedCommerceService.createPickupWindowService.mockResolvedValue({ id: 42 });

    const app = withAuth();
    app.use(commerceRouter);

    const response = await request(app)
      .post("/admin/pickup-windows")
      .set("x-role", "ADMINISTRATOR")
      .send({
        pickupPointId: 1,
        windowDate: "2026-05-01",
        startTime: "09:00:00",
        endTime: "10:00:00",
        capacityTotal: 50,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(42);
  });

  it("rejects pickup window with invalid 2-hour duration at route level", async () => {
    mockedCommerceService.createPickupWindowService.mockRejectedValue(
      new Error("INVALID_PICKUP_WINDOW_DURATION"),
    );

    const app = withAuth();
    app.use(commerceRouter);

    const response = await request(app)
      .post("/admin/pickup-windows")
      .set("x-role", "ADMINISTRATOR")
      .send({
        pickupPointId: 1,
        windowDate: "2026-05-01",
        startTime: "09:00:00",
        endTime: "11:00:00",
        capacityTotal: 50,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PICKUP_WINDOW_DURATION");
  });

  // --- Discussion RBAC: FINANCE_CLERK rejection ---

  it("rejects FINANCE_CLERK on discussion thread comments endpoint", async () => {
    const app = withAuth();
    app.use(discussionRouter);

    const response = await request(app)
      .get("/threads/7/comments")
      .set("x-role", "FINANCE_CLERK");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ROLE_FORBIDDEN");
    expect(mockedDiscussionService.getThreadComments).not.toHaveBeenCalled();
  });

  it("rejects FINANCE_CLERK on comment creation endpoint", async () => {
    const app = withAuth();
    app.use(discussionRouter);

    const response = await request(app)
      .post("/comments")
      .set("x-role", "FINANCE_CLERK")
      .send({
        contextType: "LISTING",
        contextId: 1,
        body: "This should be rejected",
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ROLE_FORBIDDEN");
    expect(mockedDiscussionService.createThreadComment).not.toHaveBeenCalled();
  });

  it("rejects FINANCE_CLERK on notification endpoint", async () => {
    const app = withAuth();
    app.use(discussionRouter);

    const response = await request(app)
      .get("/notifications")
      .set("x-role", "FINANCE_CLERK");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ROLE_FORBIDDEN");
    expect(mockedDiscussionService.listUserNotifications).not.toHaveBeenCalled();
  });
});
