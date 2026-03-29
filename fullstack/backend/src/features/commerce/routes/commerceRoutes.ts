import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../../../middleware/rbac";
import {
  getPickupPointDetail,
  listActiveBuyingCycles,
  listListings,
  toggleFavoriteTarget,
} from "../services/commerceService";

const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

const activeCycleQuerySchema = pagingSchema.extend({
  sortBy: z.enum(["startsAt", "endsAt", "name"]).default("startsAt"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

const listingsQuerySchema = pagingSchema.extend({
  cycleId: z.coerce.number().int().positive(),
  search: z.string().optional(),
  sortBy: z.enum(["title", "price", "recent"]).default("recent"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

const toggleFavoriteSchema = z.object({
  type: z.enum(["PICKUP_POINT", "LEADER"]),
  targetId: z.coerce.number().int().positive(),
});

export const commerceRouter = Router();

const handleRouteError = (error: unknown, response: Response): boolean => {
  if (error instanceof z.ZodError) {
    response.status(400).json({
      error: "Invalid request payload.",
      details: error.issues,
    });
    return true;
  }

  if (error instanceof Error && error.message.startsWith("Favorite target")) {
    response.status(404).json({ error: error.message });
    return true;
  }

  return false;
};

commerceRouter.get(
  "/buying-cycles/active",
  requireAuth,
  requireRoles("MEMBER"),
  async (request, response, next) => {
    try {
      const query = activeCycleQuerySchema.parse(request.query);
      const result = await listActiveBuyingCycles(query);
      response.json({
        data: result.rows,
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
      });
    } catch (error) {
      if (handleRouteError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

commerceRouter.get(
  "/listings",
  requireAuth,
  requireRoles("MEMBER"),
  async (request, response, next) => {
    try {
      const query = listingsQuerySchema.parse(request.query);
      const result = await listListings({
        userId: request.auth!.userId,
        query,
      });

      response.json({
        data: result.rows,
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
      });
    } catch (error) {
      if (handleRouteError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

commerceRouter.get(
  "/pickup-points/:id",
  requireAuth,
  requireRoles("MEMBER"),
  async (request, response, next) => {
    try {
      const pickupPointId = z.coerce
        .number()
        .int()
        .positive()
        .parse(request.params.id);
      const result = await getPickupPointDetail({
        userId: request.auth!.userId,
        pickupPointId,
      });

      if (!result) {
        response.status(404).json({ error: "Pickup point not found." });
        return;
      }

      response.json(result);
    } catch (error) {
      if (handleRouteError(error, response)) {
        return;
      }
      next(error);
    }
  },
);

commerceRouter.post(
  "/favorites/toggle",
  requireAuth,
  requireRoles("MEMBER"),
  async (request, response, next) => {
    try {
      const payload = toggleFavoriteSchema.parse(request.body);
      const result = await toggleFavoriteTarget({
        userId: request.auth!.userId,
        type: payload.type,
        targetId: payload.targetId,
      });

      response.json({
        type: payload.type,
        targetId: payload.targetId,
        isFavorite: result.isFavorite,
      });
    } catch (error) {
      if (handleRouteError(error, response)) {
        return;
      }
      next(error);
    }
  },
);
