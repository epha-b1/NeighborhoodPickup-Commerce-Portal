import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../../../middleware/rbac";
import {
  getAuditExportCsv,
  getAuditSearch,
  verifyAuditChain,
} from "../services/auditService";

const querySchema = z.object({
  actorUserId: z.coerce.number().int().positive().optional(),
  resourceType: z.string().trim().min(1).optional(),
  action: z
    .enum([
      "UPLOAD",
      "DOWNLOAD",
      "SHARE",
      "PERMISSION_CHANGE",
      "APPROVAL",
      "DELETE",
      "ROLLBACK",
    ])
    .optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const handleAuditError = (error: unknown, response: Response): boolean => {
  if (error instanceof z.ZodError) {
    response
      .status(400)
      .json({ error: "Invalid query.", details: error.issues });
    return true;
  }
  return false;
};

export const auditRouter = Router();

auditRouter.get(
  "/audit/logs",
  requireAuth,
  requireRoles("ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const query = querySchema.parse(request.query);
      const result = await getAuditSearch(query);
      response.json({
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        data: result.rows,
      });
    } catch (error) {
      if (handleAuditError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

auditRouter.get(
  "/audit/logs/export",
  requireAuth,
  requireRoles("ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const query = querySchema.parse(request.query);
      const csv = await getAuditExportCsv(query);
      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader(
        "Content-Disposition",
        'attachment; filename="audit-logs.csv"',
      );
      response.status(200).send(csv);
    } catch (error) {
      if (handleAuditError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

auditRouter.get(
  "/audit/logs/verify-chain",
  requireAuth,
  requireRoles("ADMINISTRATOR"),
  async (_request, response, next) => {
    try {
      const result = await verifyAuditChain();
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);
