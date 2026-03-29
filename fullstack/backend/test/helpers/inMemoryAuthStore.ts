import type { AuthStore, AuthUser, SessionRecord, AuthAttemptRecord } from '../../src/auth/types';

type SessionEntity = {
  tokenHash: string;
  userId: number;
  expiresAt: Date;
  revokedAt?: Date;
};

export class InMemoryAuthStore implements AuthStore {
  private usersByUsername = new Map<string, AuthUser>();
  private usersById = new Map<number, AuthUser>();
  private attempts = new Map<string, AuthAttemptRecord[]>();
  private sessions = new Map<string, SessionEntity>();

  public addUser(user: AuthUser): void {
    this.usersByUsername.set(user.username, user);
    this.usersById.set(user.id, user);
  }

  public seedAttempts(username: string, attempts: AuthAttemptRecord[]): void {
    this.attempts.set(username, [...attempts]);
  }

  public async findUserByUsername(username: string): Promise<AuthUser | null> {
    return this.usersByUsername.get(username) ?? null;
  }

  public async findUserById(userId: number): Promise<AuthUser | null> {
    return this.usersById.get(userId) ?? null;
  }

  public async listRecentAttempts(
    username: string,
    limit: number
  ): Promise<AuthAttemptRecord[]> {
    const current = this.attempts.get(username) ?? [];
    return current.slice(0, limit);
  }

  public async recordAuthAttempt(params: {
    username: string;
    success: boolean;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const list = this.attempts.get(params.username) ?? [];
    list.unshift({
      success: params.success,
      attemptedAt: new Date()
    });
    this.attempts.set(params.username, list);
  }

  public async createSession(params: {
    userId: number;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    this.sessions.set(params.tokenHash, {
      tokenHash: params.tokenHash,
      userId: params.userId,
      expiresAt: params.expiresAt
    });
  }

  public async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    const user = this.usersById.get(session.userId);
    if (!user || !user.isActive) {
      return null;
    }

    return {
      userId: user.id,
      username: user.username,
      roles: user.roles,
      expiresAt: session.expiresAt
    };
  }

  public async revokeSession(tokenHash: string): Promise<void> {
    const existing = this.sessions.get(tokenHash);
    if (existing) {
      existing.revokedAt = new Date();
    }
  }

  public async touchSession(_tokenHash: string): Promise<void> {
    return;
  }
}