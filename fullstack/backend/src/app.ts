import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { authRouter } from "./routes/authRoutes";
import { roleRouter } from "./routes/roleRoutes";
import { AuthService } from "./auth/authService";
import { MySqlAuthStore } from "./auth/mysqlAuthStore";
import { authSessionMiddleware } from "./middleware/sessionAuth";
import { csrfOriginGuard } from "./middleware/csrfOriginGuard";
import { commerceRouter } from "./features/commerce/routes/commerceRoutes";
import { orderRouter } from "./features/orders/routes/orderRoutes";
import { discussionRouter } from "./features/discussions/routes/discussionRoutes";
import { appealRouter } from "./features/appeals/routes/appealRoutes";
import { financeRouter } from "./features/finance/routes/financeRoutes";
import { leaderRouter } from "./features/leaders/routes/leaderRoutes";
import { auditRouter } from "./features/audit/routes/auditRoutes";
import { behaviorRouter } from "./features/behavior/routes/behaviorRoutes";
import { startBehaviorBackgroundJobs } from "./features/behavior/services/behaviorService";
import { registerApiDocs } from "./docs/registerApiDocs";
import { sendError, sendSuccess } from "./utils/apiResponse";
import { logger } from "./utils/logger";

const logUnhandledError = (params: {
  error: unknown;
  request: express.Request;
}): void => {
  const message =
    params.error instanceof Error ? params.error.message : "Unknown error";
  const stack =
    env.logUnhandledErrorIncludeStack && params.error instanceof Error
      ? params.error.stack
      : undefined;

  logger.error("http.unhandled_error", message, {
    method: params.request.method,
    path: params.request.originalUrl,
    userId: params.request.auth?.userId ?? null,
    requestId: params.request.header("x-request-id") ?? null,
    stack,
  });
};

export const createApp = () => {
  const app = express();

  startBehaviorBackgroundJobs();

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.frontendOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      credentials: true,
    }),
  );

  app.use(express.json());

  const authService = new AuthService(new MySqlAuthStore());
  app.use(authSessionMiddleware(authService));
  app.use(csrfOriginGuard);

  registerApiDocs(app);

  app.get("/health", (_request, response) => {
    sendSuccess(response, { ok: true });
  });

  app.use("/auth", authRouter);
  app.use("/rbac", roleRouter);
  app.use("/", commerceRouter);
  app.use("/", orderRouter);
  app.use("/", discussionRouter);
  app.use("/", appealRouter);
  app.use("/", financeRouter);
  app.use("/", leaderRouter);
  app.use("/", auditRouter);
  app.use("/", behaviorRouter);

  app.use(
    (
      error: unknown,
      request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      void next;
      logUnhandledError({ error, request });
      sendError(
        response,
        500,
        "Internal server error.",
        "INTERNAL_SERVER_ERROR",
      );
    },
  );

  return app;
};
