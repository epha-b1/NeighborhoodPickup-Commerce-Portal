import express from "express";
import request from "supertest";

import { discussionRouter } from "../../src/features/discussions/routes/discussionRoutes";
import * as discussionService from "../../src/features/discussions/services/discussionService";

vi.mock("../../src/features/discussions/services/discussionService", () => ({
  createThreadComment: vi.fn(),
  flagComment: vi.fn(),
  getThreadComments: vi.fn(),
  resolveThreadByContext: vi.fn(),
  listUserNotifications: vi.fn(),
  patchNotificationReadState: vi.fn(),
  unhideComment: vi.fn(),
}));

const mockedService = vi.mocked(discussionService);

const buildApp = () => {
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
  app.use(discussionRouter);
  return app;
};

describe("unhide workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows reviewer to unhide a comment", async () => {
    mockedService.unhideComment.mockResolvedValue({
      commentId: 5,
      isHidden: false,
      reason: "Unhidden by moderator: test",
    });

    const app = buildApp();

    const response = await request(app)
      .patch("/comments/5/visibility")
      .set("x-role", "REVIEWER")
      .send({ reason: "Reinstated after review" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.commentId).toBe(5);
    expect(response.body.data.isHidden).toBe(false);
    expect(mockedService.unhideComment).toHaveBeenCalledWith(
      expect.objectContaining({
        commentId: 5,
        roles: ["REVIEWER"],
      }),
    );
  });

  it("allows administrator to unhide a comment", async () => {
    mockedService.unhideComment.mockResolvedValue({
      commentId: 5,
      isHidden: false,
      reason: "Unhidden by moderator: admin override",
    });

    const app = buildApp();

    const response = await request(app)
      .patch("/comments/5/visibility")
      .set("x-role", "ADMINISTRATOR")
      .send({ reason: "admin override" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.isHidden).toBe(false);
  });

  it("rejects MEMBER with 403 on unhide endpoint", async () => {
    const app = buildApp();

    const response = await request(app)
      .patch("/comments/5/visibility")
      .set("x-role", "MEMBER")
      .send({ reason: "Trying to unhide" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ROLE_FORBIDDEN");
    expect(mockedService.unhideComment).not.toHaveBeenCalled();
  });

  it("rejects FINANCE_CLERK with 403 on unhide endpoint", async () => {
    const app = buildApp();

    const response = await request(app)
      .patch("/comments/5/visibility")
      .set("x-role", "FINANCE_CLERK")
      .send({ reason: "Trying to unhide" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ROLE_FORBIDDEN");
    expect(mockedService.unhideComment).not.toHaveBeenCalled();
  });

  it("returns 404 when comment is not found", async () => {
    mockedService.unhideComment.mockRejectedValue(
      new Error("COMMENT_NOT_FOUND"),
    );

    const app = buildApp();

    const response = await request(app)
      .patch("/comments/999/visibility")
      .set("x-role", "REVIEWER")
      .send({ reason: "Attempting unhide" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("COMMENT_NOT_FOUND");
  });

  it("returns 400 when comment is not currently hidden", async () => {
    mockedService.unhideComment.mockRejectedValue(
      new Error("COMMENT_NOT_HIDDEN"),
    );

    const app = buildApp();

    const response = await request(app)
      .patch("/comments/5/visibility")
      .set("x-role", "REVIEWER")
      .send({ reason: "Attempting unhide" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("COMMENT_NOT_HIDDEN");
  });
});
