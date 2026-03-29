import { Router } from "express";
import { z } from "zod";
import { AuthService } from "../auth/authService";
import { MySqlAuthStore } from "../auth/mysqlAuthStore";
import { sendError, sendSuccess } from "../utils/apiResponse";
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from "../middleware/sessionAuth";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const authService = new AuthService(new MySqlAuthStore());

export const authRouter = Router();

authRouter.post("/login", async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      sendError(response, 400, "Invalid login payload.", "INVALID_PAYLOAD");
      return;
    }

    const result = await authService.login({
      username: parsed.data.username,
      password: parsed.data.password,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });

    if (!result.ok) {
      const status = result.code === "LOCKED" ? 423 : 401;
      sendError(response, status, result.message, result.code, {
        lockedUntil: result.lockedUntil?.toISOString(),
      });
      return;
    }

    setSessionCookie(response, result.token, result.expiresAt);

    sendSuccess(response, {
      user: result.user,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", async (request, response, next) => {
  try {
    const token = readSessionToken(request);
    await authService.logout(token);
    clearSessionCookie(response);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", async (request, response, next) => {
  try {
    const token = readSessionToken(request);
    const session = await authService.getCurrentSession(token);

    if (!session) {
      clearSessionCookie(response);
      sendError(response, 401, "Not authenticated.", "NOT_AUTHENTICATED");
      return;
    }

    sendSuccess(response, {
      user: {
        id: session.userId,
        username: session.username,
        roles: session.roles,
      },
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});
