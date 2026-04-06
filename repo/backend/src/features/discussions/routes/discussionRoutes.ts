import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../../../middleware/rbac";
import { sendError, sendSuccess } from "../../../utils/apiResponse";
import {
  createThreadComment,
  flagComment,
  getThreadComments,
  resolveThreadByContext,
  listUserNotifications,
  patchNotificationReadState,
  unhideComment,
} from "../services/discussionService";

const createCommentSchema = z.object({
  contextType: z.enum(["LISTING", "ORDER"]),
  contextId: z.coerce.number().int().positive(),
  parentCommentId: z.coerce.number().int().positive().optional(),
  quotedCommentId: z.coerce.number().int().positive().optional(),
  body: z.string().trim().min(1).max(5000),
});

const flagSchema = z.object({
  reason: z.string().trim().min(3).max(255),
});

const threadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  sort: z.enum(["newest", "oldest", "most_replies"]).default("newest"),
});

const threadResolveQuerySchema = z.object({
  contextType: z.enum(["LISTING", "ORDER"]),
  contextId: z.coerce.number().int().positive(),
});

const notificationReadStateSchema = z.object({
  readState: z.enum(["READ", "UNREAD"]),
});

const handleDiscussionError = (error: unknown, response: Response): boolean => {
  if (error instanceof z.ZodError) {
    sendError(
      response,
      400,
      "Invalid request payload.",
      "INVALID_REQUEST_PAYLOAD",
      error.issues,
    );
    return true;
  }

  if (error instanceof Error && error.message === "INVALID_PARENT_COMMENT") {
    sendError(
      response,
      400,
      "Parent comment is invalid for this thread.",
      "INVALID_PARENT_COMMENT",
    );
    return true;
  }

  if (error instanceof Error && error.message === "INVALID_QUOTED_COMMENT") {
    sendError(
      response,
      400,
      "Quoted comment is invalid for this thread.",
      "INVALID_QUOTED_COMMENT",
    );
    return true;
  }

  if (error instanceof Error && error.message === "COMMENT_NOT_FOUND") {
    sendError(response, 404, "Comment not found.", "COMMENT_NOT_FOUND");
    return true;
  }

  if (
    error instanceof Error &&
    error.message === "CANNOT_FLAG_OWN_COMMENT"
  ) {
    sendError(
      response,
      403,
      "You cannot flag your own comment.",
      "CANNOT_FLAG_OWN_COMMENT",
    );
    return true;
  }

  if (error instanceof Error && error.message === "THREAD_FORBIDDEN") {
    sendError(
      response,
      403,
      "You do not have access to this thread.",
      "THREAD_FORBIDDEN",
    );
    return true;
  }

  if (error instanceof Error && error.message === "CONTEXT_NOT_FOUND") {
    sendError(
      response,
      404,
      "The referenced listing or order does not exist.",
      "CONTEXT_NOT_FOUND",
    );
    return true;
  }

  if (error instanceof Error && error.message === "UNHIDE_FORBIDDEN") {
    sendError(
      response,
      403,
      "Only reviewers or administrators can unhide comments.",
      "UNHIDE_FORBIDDEN",
    );
    return true;
  }

  if (error instanceof Error && error.message === "COMMENT_NOT_HIDDEN") {
    sendError(
      response,
      400,
      "Comment is not currently hidden.",
      "COMMENT_NOT_HIDDEN",
    );
    return true;
  }

  return false;
};

export const discussionRouter = Router();

discussionRouter.post(
  "/comments",
  requireAuth,
  requireRoles("MEMBER", "GROUP_LEADER", "REVIEWER", "ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const payload = createCommentSchema.parse(request.body);

      const result = await createThreadComment({
        input: payload,
        userId: request.auth!.userId,
        username: request.auth!.username,
        roles: request.auth!.roles,
      });

      sendSuccess(response, result, 201);
    } catch (error) {
      if (handleDiscussionError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

discussionRouter.get(
  "/threads/:id/comments",
  requireAuth,
  requireRoles("MEMBER", "GROUP_LEADER", "REVIEWER", "ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const discussionId = z.coerce
        .number()
        .int()
        .positive()
        .parse(request.params.id);
      const query = threadQuerySchema.parse(request.query);

      const thread = await getThreadComments({
        discussionId,
        page: query.page,
        sort: query.sort,
        userId: request.auth!.userId,
        roles: request.auth!.roles,
      });

      if (!thread) {
        sendError(response, 404, "Thread not found.", "THREAD_NOT_FOUND");
        return;
      }

      sendSuccess(response, thread);
    } catch (error) {
      if (handleDiscussionError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

discussionRouter.get(
  "/threads/resolve",
  requireAuth,
  requireRoles("MEMBER", "GROUP_LEADER", "REVIEWER", "ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const query = threadResolveQuerySchema.parse(request.query);

      const thread = await resolveThreadByContext({
        contextType: query.contextType,
        contextId: query.contextId,
        userId: request.auth!.userId,
        roles: request.auth!.roles,
      });

      sendSuccess(response, thread);
    } catch (error) {
      if (handleDiscussionError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

discussionRouter.post(
  "/comments/:id/flag",
  requireAuth,
  requireRoles("MEMBER", "GROUP_LEADER", "REVIEWER", "ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const commentId = z.coerce
        .number()
        .int()
        .positive()
        .parse(request.params.id);
      const payload = flagSchema.parse(request.body);

      const result = await flagComment({
        commentId,
        flaggedByUserId: request.auth!.userId,
        roles: request.auth!.roles,
        reason: payload.reason,
      });

      sendSuccess(response, result);
    } catch (error) {
      if (handleDiscussionError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

discussionRouter.get(
  "/notifications",
  requireAuth,
  requireRoles("MEMBER", "GROUP_LEADER", "REVIEWER", "ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .default(1)
        .parse(request.query.page);
      const result = await listUserNotifications({
        userId: request.auth!.userId,
        page,
      });

      sendSuccess(response, {
        page,
        pageSize: 20,
        total: result.total,
        data: result.notifications,
      });
    } catch (error) {
      if (handleDiscussionError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

discussionRouter.patch(
  "/notifications/:id/read-state",
  requireAuth,
  requireRoles("MEMBER", "GROUP_LEADER", "REVIEWER", "ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const notificationId = z.coerce
        .number()
        .int()
        .positive()
        .parse(request.params.id);
      const payload = notificationReadStateSchema.parse(request.body);

      const updated = await patchNotificationReadState({
        userId: request.auth!.userId,
        notificationId,
        readState: payload.readState,
      });

      if (!updated) {
        sendError(
          response,
          404,
          "Notification not found.",
          "NOTIFICATION_NOT_FOUND",
        );
        return;
      }

      sendSuccess(response, {
        notificationId,
        readState: payload.readState,
      });
    } catch (error) {
      if (handleDiscussionError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

const unhideReasonSchema = z.object({
  reason: z.string().trim().min(3).max(255),
});

discussionRouter.patch(
  "/comments/:id/visibility",
  requireAuth,
  requireRoles("REVIEWER", "ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const commentId = z.coerce
        .number()
        .int()
        .positive()
        .parse(request.params.id);
      const payload = unhideReasonSchema.parse(request.body);

      const result = await unhideComment({
        commentId,
        actorUserId: request.auth!.userId,
        roles: request.auth!.roles,
        reason: payload.reason,
      });

      sendSuccess(response, result);
    } catch (error) {
      if (handleDiscussionError(error, response)) {
        return;
      }
      next(error);
    }
  },
);
