import type { RoleName } from './roles';

export type AuthAttemptRecord = {
  success: boolean;
  attemptedAt: Date;
};

export type AuthUser = {
  id: number;
  username: string;
  passwordHash: string;
  isActive: boolean;
  roles: RoleName[];
};

export type SessionRecord = {
  userId: number;
  username: string;
  roles: RoleName[];
  expiresAt: Date;
};

export interface AuthStore {
  findUserByUsername(username: string): Promise<AuthUser | null>;
  findUserById(userId: number): Promise<AuthUser | null>;
  listRecentAttempts(username: string, limit: number): Promise<AuthAttemptRecord[]>;
  recordAuthAttempt(params: {
    username: string;
    success: boolean;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void>;
  createSession(params: {
    userId: number;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  revokeSession(tokenHash: string): Promise<void>;
  touchSession(tokenHash: string): Promise<void>;
}