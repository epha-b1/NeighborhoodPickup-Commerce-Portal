import type { NextFunction, Request, Response } from "express";
import type { RoleName } from "../auth/roles";
import { sendError } from "../utils/apiResponse";

export const requireAuth = (request: Request, response: Response, next: NextFunction): void => {
  if (!request.auth) {
    sendError(response, 401, "Authentication required.", "NOT_AUTHENTICATED");
    return;
  }
  next();
};

export const requireRoles = (...allowedRoles: RoleName[]) => {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.auth) {
      sendError(response, 401, "Authentication required.", "NOT_AUTHENTICATED");
      return;
    }

    const hasAllowedRole = request.auth.roles.some((role) =>
      allowedRoles.includes(role),
    );

    if (!hasAllowedRole) {
      sendError(
        response,
        403,
        "You are not authorized for this route.",
        "ROLE_FORBIDDEN",
        { allowedRoles },
      );
      return;
    }

    next();
  };
};
