import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../../../middleware/rbac";
import {
  getBehaviorSummary,
  getRetentionStatus,
  ingestBehaviorEvents,
  runRetentionJobs,
} from "../services/behaviorService";

const behaviorEventSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  eventType: z.enum([
    "IMPRESSION",
    "CLICK",
    "FAVORITE",
    "VOTE",
    "WATCH_COMPLETION",
  ]),
  resourceType: z.string().trim().min(1).max(64),
  resourceId: z.string().trim().max(128).optional(),
  clientRecordedAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ingestSchema = z.object({
  events: z.array(behaviorEventSchema).min(1).max(100),
});

const summaryQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

const handleBehaviorError = (error: unknown, response: Response): boolean => {
  if (error instanceof z.ZodError) {
    response
      .status(400)
      .json({ error: "Invalid request payload.", details: error.issues });
    return true;
  }
  return false;
};

export const behaviorRouter = Router();

behaviorRouter.post(
  "/behavior/events",
  requireAuth,
  async (request, response, next) => {
    try {
      const payload = ingestSchema.parse(request.body);
      const result = await ingestBehaviorEvents({
        userId: request.auth!.userId,
        events: payload.events,
      });
      response.status(202).json(result);
    } catch (error) {
      if (handleBehaviorError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

behaviorRouter.get(
  "/behavior/summary",
  requireAuth,
  requireRoles("ADMINISTRATOR", "FINANCE_CLERK"),
  async (request, response, next) => {
    try {
      const query = summaryQuerySchema.parse(request.query);
      const rows = await getBehaviorSummary(query);
      response.json({ data: rows });
    } catch (error) {
      if (handleBehaviorError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

behaviorRouter.get(
  "/admin/jobs/retention-status",
  requireAuth,
  requireRoles("ADMINISTRATOR"),
  async (_request, response, next) => {
    try {
      const status = await getRetentionStatus();
      response.json(status);
    } catch (error) {
      next(error);
    }
  },
);

behaviorRouter.post(
  "/admin/jobs/retention-run",
  requireAuth,
  requireRoles("ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const result = await runRetentionJobs(request.auth!.userId);
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);
