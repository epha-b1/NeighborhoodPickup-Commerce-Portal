import type { Request, Response, NextFunction } from 'express';
import type { AuthService } from '../auth/authService';
import { env } from '../config/env';

export const sessionCookieName = 'neighborhoodpickup_session';

const parseCookieValue = (cookieHeader: string | undefined, key: string): string | undefined => {
  if (!cookieHeader) {
    return undefined;
  }

  const segments = cookieHeader.split(';').map((part) => part.trim());
  const target = segments.find((segment) => segment.startsWith(`${key}=`));

  if (!target) {
    return undefined;
  }

  return decodeURIComponent(target.substring(key.length + 1));
};

export const setSessionCookie = (
  response: Response,
  token: string,
  expiresAt: Date
): void => {
  response.cookie(sessionCookieName, encodeURIComponent(token), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    expires: expiresAt
  });
};

export const clearSessionCookie = (response: Response): void => {
  response.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction
  });
};

export const authSessionMiddleware = (authService: AuthService) => {
  return async (request: Request, response: Response, next: NextFunction) => {
    const token = parseCookieValue(request.headers.cookie, sessionCookieName);

    if (!token) {
      return next();
    }

    try {
      const session = await authService.getCurrentSession(token);
      if (session) {
        request.auth = {
          userId: session.userId,
          username: session.username,
          roles: session.roles,
          tokenHash: 'resolved'
        };
      } else {
        clearSessionCookie(response);
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

export const readSessionToken = (request: Request): string | undefined => {
  return parseCookieValue(request.headers.cookie, sessionCookieName);
};
