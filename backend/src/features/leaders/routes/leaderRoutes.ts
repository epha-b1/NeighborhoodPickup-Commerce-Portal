import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../../../middleware/rbac";
import {
  getLeaderDashboard,
  getMyLeaderApplication,
  getPendingLeaderApplications,
  reviewLeaderApplication,
  submitLeaderApplication,
} from "../services/leaderService";

const createApplicationSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(6).max(32),
  experienceSummary: z.string().trim().min(20).max(4000),
  pickupPointId: z.coerce.number().int().positive().optional(),
  requestedCommissionEligible: z.boolean().default(false),
});

const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(3).max(255),
  commissionEligible: z.boolean().default(false),
});

const dashboardQuerySchema = z.object({
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

const handleLeaderError = (error: unknown, response: Response): boolean => {
  if (error instanceof z.ZodError) {
    response
      .status(400)
      .json({ error: "Invalid request payload.", details: error.issues });
    return true;
  }

  if (
    error instanceof Error &&
    error.message === "LEADER_APPLICATION_ALREADY_PENDING"
  ) {
    response
      .status(409)
      .json({ error: "A pending application already exists for this leader." });
    return true;
  }

  if (
    error instanceof Error &&
    error.message === "LEADER_APPLICATION_NOT_FOUND"
  ) {
    response.status(404).json({ error: "Leader application not found." });
    return true;
  }

  if (
    error instanceof Error &&
    error.message === "LEADER_APPLICATION_ALREADY_REVIEWED"
  ) {
    response
      .status(409)
      .json({ error: "Leader application has already been reviewed." });
    return true;
  }

  return false;
};

export const leaderRouter = Router();

leaderRouter.post(
  "/leaders/applications",
  requireAuth,
  requireRoles("MEMBER", "GROUP_LEADER"),
  async (request, response, next) => {
    try {
      const payload = createApplicationSchema.parse(request.body);
      const result = await submitLeaderApplication({
        userId: request.auth!.userId,
        input: payload,
      });
      response.status(201).json(result);
    } catch (error) {
      if (handleLeaderError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

leaderRouter.get(
  "/leaders/applications/me",
  requireAuth,
  requireRoles("MEMBER", "GROUP_LEADER"),
  async (request, response, next) => {
    try {
      const result = await getMyLeaderApplication(request.auth!.userId);
      response.json({ data: result });
    } catch (error) {
      if (handleLeaderError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

leaderRouter.get(
  "/admin/leaders/applications/pending",
  requireAuth,
  requireRoles("ADMINISTRATOR"),
  async (_request, response, next) => {
    try {
      const data = await getPendingLeaderApplications();
      response.json({ data });
    } catch (error) {
      if (handleLeaderError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

leaderRouter.post(
  "/admin/leaders/applications/:id/decision",
  requireAuth,
  requireRoles("ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const applicationId = z.coerce
        .number()
        .int()
        .positive()
        .parse(request.params.id);
      const payload = decisionSchema.parse(request.body);
      const result = await reviewLeaderApplication({
        applicationId,
        adminUserId: request.auth!.userId,
        input: payload,
      });
      response.json(result);
    } catch (error) {
      if (handleLeaderError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

leaderRouter.get(
  "/leaders/dashboard/metrics",
  requireAuth,
  requireRoles("GROUP_LEADER"),
  async (request, response, next) => {
    try {
      const query = dashboardQuerySchema.parse(request.query);
      const data = await getLeaderDashboard({
        leaderUserId: request.auth!.userId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });

      if (!data) {
        response
          .status(404)
          .json({
            error: "Leader record not found. Apply for onboarding first.",
          });
        return;
      }

      response.json(data);
    } catch (error) {
      if (handleLeaderError(error, response)) {
        return;
      }
      next(error);
    }
  },
);
