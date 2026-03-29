import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../../../middleware/rbac";
import { sendError } from "../../../utils/apiResponse";
import {
  addOrReplaceBlacklist,
  getCommissionSummary,
  getReconciliationCsv,
  getWithdrawalBlacklist,
  getWithdrawalEligibility,
  patchBlacklistEntry,
  removeBlacklistEntry,
  requestWithdrawal,
} from "../services/financeService";

const commissionQuerySchema = z.object({
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

const withdrawalSchema = z.object({
  amount: z.coerce.number().positive(),
  leaderUserId: z.coerce.number().int().positive().optional(),
});

const blacklistUpsertSchema = z.object({
  userId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(255),
  active: z.boolean().default(true),
});

const blacklistPatchSchema = z.object({
  reason: z.string().trim().min(3).max(255).optional(),
  active: z.boolean().optional(),
});

const exportQuerySchema = z.object({
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
});

const handleFinanceError = (error: unknown, response: Response): boolean => {
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

  const badRequestErrors = new Set([
    "INVALID_WITHDRAWAL_AMOUNT",
    "WITHDRAWAL_DAILY_LIMIT_EXCEEDED",
    "WITHDRAWAL_WEEKLY_LIMIT_EXCEEDED",
  ]);

  if (error instanceof Error && badRequestErrors.has(error.message)) {
    sendError(response, 400, error.message, error.message);
    return true;
  }

  if (error instanceof Error && error.message === "WITHDRAWAL_NOT_ELIGIBLE") {
    sendError(response, 409, error.message, error.message);
    return true;
  }

  if (
    error instanceof Error &&
    error.message === "LEADER_NOT_ELIGIBLE_FOR_WITHDRAWAL"
  ) {
    sendError(response, 403, error.message, error.message);
    return true;
  }

  return false;
};

export const financeRouter = Router();

financeRouter.get(
  "/finance/commissions",
  requireAuth,
  requireRoles("FINANCE_CLERK", "ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const query = commissionQuerySchema.parse(request.query);
      const data = await getCommissionSummary(query);
      response.json({ data });
    } catch (error) {
      if (handleFinanceError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

financeRouter.get(
  "/finance/withdrawals/eligibility",
  requireAuth,
  requireRoles("GROUP_LEADER", "FINANCE_CLERK", "ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const queryLeaderId = z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .parse(request.query.leaderUserId);
      const isFinanceOrAdmin = request.auth!.roles.some((role) =>
        ["FINANCE_CLERK", "ADMINISTRATOR"].includes(role),
      );

      const leaderUserId = queryLeaderId ?? request.auth!.userId;

      if (queryLeaderId && !isFinanceOrAdmin) {
        sendError(
          response,
          403,
          "You are not authorized to review another leader's eligibility.",
          "ROLE_FORBIDDEN",
        );
        return;
      }

      const data = await getWithdrawalEligibility(leaderUserId);
      response.json(data);
    } catch (error) {
      if (handleFinanceError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

financeRouter.post(
  "/finance/withdrawals",
  requireAuth,
  requireRoles("GROUP_LEADER", "FINANCE_CLERK", "ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const payload = withdrawalSchema.parse(request.body);
      const isFinanceOrAdmin = request.auth!.roles.some((role) =>
        ["FINANCE_CLERK", "ADMINISTRATOR"].includes(role),
      );

      const leaderUserId = payload.leaderUserId ?? request.auth!.userId;

      if (payload.leaderUserId && !isFinanceOrAdmin) {
        sendError(
          response,
          403,
          "You are not authorized to request a withdrawal for another leader.",
          "ROLE_FORBIDDEN",
        );
        return;
      }

      const result = await requestWithdrawal({
        leaderUserId,
        amount: payload.amount,
        requestedByUserId: request.auth!.userId,
      });

      response.status(201).json(result);
    } catch (error) {
      if (handleFinanceError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

financeRouter.get(
  "/finance/reconciliation/export",
  requireAuth,
  requireRoles("FINANCE_CLERK", "ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const query = exportQuerySchema.parse(request.query);
      const result = await getReconciliationCsv({
        requestedByUserId: request.auth!.userId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });

      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.fileName}"`,
      );
      response.status(200).send(result.csv);
    } catch (error) {
      if (handleFinanceError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

financeRouter.get(
  "/admin/withdrawal-blacklist",
  requireAuth,
  requireRoles("ADMINISTRATOR"),
  async (_request, response, next) => {
    try {
      const data = await getWithdrawalBlacklist();
      response.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/admin/withdrawal-blacklist",
  requireAuth,
  requireRoles("ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const payload = blacklistUpsertSchema.parse(request.body);
      await addOrReplaceBlacklist({
        userId: payload.userId,
        reason: payload.reason,
        active: payload.active,
        createdByUserId: request.auth!.userId,
      });
      response.status(201).json({ ok: true });
    } catch (error) {
      if (handleFinanceError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

financeRouter.patch(
  "/admin/withdrawal-blacklist/:id",
  requireAuth,
  requireRoles("ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const id = z.coerce.number().int().positive().parse(request.params.id);
      const payload = blacklistPatchSchema.parse(request.body);
      const updated = await patchBlacklistEntry({
        id,
        reason: payload.reason,
        active: payload.active,
        actorUserId: request.auth!.userId,
      });

      if (!updated) {
        sendError(response, 404, "Blacklist entry not found.", "BLACKLIST_NOT_FOUND");
        return;
      }

      response.json({ ok: true });
    } catch (error) {
      if (handleFinanceError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

financeRouter.delete(
  "/admin/withdrawal-blacklist/:id",
  requireAuth,
  requireRoles("ADMINISTRATOR"),
  async (request, response, next) => {
    try {
      const id = z.coerce.number().int().positive().parse(request.params.id);
      const deleted = await removeBlacklistEntry({
        id,
        actorUserId: request.auth!.userId,
      });
      if (!deleted) {
        sendError(response, 404, "Blacklist entry not found.", "BLACKLIST_NOT_FOUND");
        return;
      }
      response.status(204).send();
    } catch (error) {
      if (handleFinanceError(error, response)) {
        return;
      }
      next(error);
    }
  },
);
