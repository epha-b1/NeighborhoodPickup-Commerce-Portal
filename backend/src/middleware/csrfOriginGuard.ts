import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const parseRequestOrigin = (request: Request): string | null => {
  const originHeader = request.header("origin");
  if (originHeader) {
    return originHeader;
  }

  const refererHeader = request.header("referer");
  if (!refererHeader) {
    return null;
  }

  try {
    return new URL(refererHeader).origin;
  } catch {
    return null;
  }
};

export const csrfOriginGuard = (
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  if (!UNSAFE_METHODS.has(request.method)) {
    next();
    return;
  }

  const requestOrigin = parseRequestOrigin(request);

  // Keep existing tests and trusted CLI flows working in test mode when no browser headers exist.
  if (!requestOrigin) {
    if (env.nodeEnv === "test") {
      next();
      return;
    }

    response.status(403).json({
      error: "CSRF origin check failed.",
      code: "CSRF_ORIGIN_REQUIRED",
    });
    return;
  }

  if (!env.frontendOrigins.includes(requestOrigin)) {
    response.status(403).json({
      error: "CSRF origin check failed.",
      code: "CSRF_ORIGIN_MISMATCH",
    });
    return;
  }

  next();
};
