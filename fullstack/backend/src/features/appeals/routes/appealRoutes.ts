import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/rbac";
import { sendError } from "../../../utils/apiResponse";
import {
  createAppealRecord,
  getAppealDetail,
  getAppealTimeline,
  listAppealQueue,
  transitionAppealStatus,
  uploadAppealFiles,
} from "../services/appealService";

const createAppealSchema = z.object({
  sourceType: z.enum(["HIDDEN_CONTENT_BANNER", "ORDER_DETAIL"]),
  sourceCommentId: z.coerce.number().int().positive().optional(),
  sourceOrderId: z.coerce.number().int().positive().optional(),
  reasonCategory: z.enum([
    "MODERATION",
    "ORDER_ISSUE",
    "FULFILLMENT",
    "QUALITY",
    "OTHER",
  ]),
  narrative: z.string().trim().min(20).max(6000),
  referencesText: z.string().trim().max(500).optional(),
});

const fileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  base64Content: z.string().trim().min(1),
});

const uploadAppealFilesSchema = z.object({
  files: z.array(fileSchema).min(1),
});

const transitionSchema = z.object({
  toStatus: z.enum(["INVESTIGATION", "RULING"]),
  note: z.string().trim().min(3).max(500),
});

const listAppealsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['INTAKE', 'INVESTIGATION', 'RULING']).optional()
});

const handleAppealError = (error: unknown, response: Response): boolean => {
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

  if (error instanceof Error && error.message === "APPEAL_NOT_FOUND") {
    sendError(response, 404, "Appeal not found.", "APPEAL_NOT_FOUND");
    return true;
  }

  if (error instanceof Error && error.message === "APPEAL_FORBIDDEN") {
    sendError(
      response,
      403,
      "You do not have access to this appeal.",
      "APPEAL_FORBIDDEN",
    );
    return true;
  }

  if (error instanceof Error && error.message === "APPEAL_STATUS_FORBIDDEN") {
    sendError(
      response,
      403,
      "Only reviewer or administrator can change appeal status.",
      "APPEAL_STATUS_FORBIDDEN",
    );
    return true;
  }

  if (error instanceof Error && error.message === "INVALID_STATUS_TRANSITION") {
    sendError(
      response,
      409,
      "Invalid appeal status transition.",
      "INVALID_STATUS_TRANSITION",
    );
    return true;
  }

  const badRequestErrors = new Set([
    "MISSING_SOURCE_COMMENT",
    "MISSING_SOURCE_ORDER",
    "SOURCE_COMMENT_NOT_FOUND",
    "SOURCE_ORDER_NOT_FOUND",
    "NO_FILES_PROVIDED",
    "TOO_MANY_FILES",
    "UNSUPPORTED_FILE_TYPE",
    "FILE_TOO_LARGE",
    "INVALID_BASE64_FILE",
  ]);

  if (error instanceof Error && badRequestErrors.has(error.message)) {
    sendError(response, 400, error.message, error.message);
    return true;
  }

  return false;
};

export const appealRouter = Router();

appealRouter.get('/appeals', requireAuth, async (request, response, next) => {
  try {
    const query = listAppealsQuerySchema.parse(request.query);
    const result = await listAppealQueue({
      requesterUserId: request.auth!.userId,
      requesterRoles: request.auth!.roles,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status
    });

    response.json({
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      data: result.rows
    });
  } catch (error) {
    if (handleAppealError(error, response)) {
      return;
    }
    next(error);
  }
});

appealRouter.post("/appeals", requireAuth, async (request, response, next) => {
  try {
    const payload = createAppealSchema.parse(request.body);

    const created = await createAppealRecord({
      userId: request.auth!.userId,
      roles: request.auth!.roles,
      input: payload,
    });

    response.status(201).json(created);
  } catch (error) {
    if (handleAppealError(error, response)) {
      return;
    }
    next(error);
  }
});

appealRouter.post(
  "/appeals/:id/files",
  requireAuth,
  async (request, response, next) => {
    try {
      const appealId = z.coerce
        .number()
        .int()
        .positive()
        .parse(request.params.id);
      const payload = uploadAppealFilesSchema.parse(request.body);

      const result = await uploadAppealFiles({
        appealId,
        userId: request.auth!.userId,
        roles: request.auth!.roles,
        files: payload.files,
      });

      response.status(201).json(result);
    } catch (error) {
      if (handleAppealError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

appealRouter.get(
  "/appeals/:id",
  requireAuth,
  async (request, response, next) => {
    try {
      const appealId = z.coerce
        .number()
        .int()
        .positive()
        .parse(request.params.id);
      const result = await getAppealDetail({
        appealId,
        requesterUserId: request.auth!.userId,
        requesterRoles: request.auth!.roles,
      });

      if (!result) {
        sendError(response, 404, "Appeal not found.", "APPEAL_NOT_FOUND");
        return;
      }

      response.json(result);
    } catch (error) {
      if (handleAppealError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

appealRouter.get(
  "/appeals/:id/timeline",
  requireAuth,
  async (request, response, next) => {
    try {
      const appealId = z.coerce
        .number()
        .int()
        .positive()
        .parse(request.params.id);
      const result = await getAppealTimeline({
        appealId,
        requesterUserId: request.auth!.userId,
        requesterRoles: request.auth!.roles,
      });

      if (!result) {
        sendError(response, 404, "Appeal not found.", "APPEAL_NOT_FOUND");
        return;
      }

      response.json(result);
    } catch (error) {
      if (handleAppealError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

appealRouter.patch(
  "/appeals/:id/status",
  requireAuth,
  async (request, response, next) => {
    try {
      const appealId = z.coerce
        .number()
        .int()
        .positive()
        .parse(request.params.id);
      const payload = transitionSchema.parse(request.body);

      const result = await transitionAppealStatus({
        appealId,
        fromUserId: request.auth!.userId,
        fromUserRoles: request.auth!.roles,
        toStatus: payload.toStatus,
        note: payload.note,
      });

      response.json(result);
    } catch (error) {
      if (handleAppealError(error, response)) {
        return;
      }
      next(error);
    }
  },
);
