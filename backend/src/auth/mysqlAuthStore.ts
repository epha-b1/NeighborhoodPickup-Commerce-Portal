import { dbPool } from '../db/pool';
import type { AuthAttemptRecord, AuthStore, AuthUser, SessionRecord } from './types';
import type { RoleName } from './roles';

const getRolesForUser = async (userId: number): Promise<RoleName[]> => {
  const [roleRows] = await dbPool.query<{ name: RoleName }[]>(
    `SELECT r.name
     FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ?`,
    [userId]
  );
  return roleRows.map((row: { name: RoleName }) => row.name);
};

export class MySqlAuthStore implements AuthStore {
  public async findUserByUsername(username: string): Promise<AuthUser | null> {
    const [rows] = await dbPool.query<
      { id: number; username: string; password_hash: string; is_active: number }[]
    >(
      `SELECT id, username, password_hash, is_active
       FROM users
       WHERE username = ?
       LIMIT 1`,
      [username]
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const roles = await getRolesForUser(row.id);

    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      isActive: row.is_active === 1,
      roles
    };
  }

  public async findUserById(userId: number): Promise<AuthUser | null> {
    const [rows] = await dbPool.query<
      { id: number; username: string; password_hash: string; is_active: number }[]
    >(
      `SELECT id, username, password_hash, is_active
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const roles = await getRolesForUser(row.id);

    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      isActive: row.is_active === 1,
      roles
    };
  }

  public async listRecentAttempts(
    username: string,
    limit: number
  ): Promise<AuthAttemptRecord[]> {
    const [rows] = await dbPool.query<{ success: number; attempted_at: Date | string }[]>(
      `SELECT success, attempted_at
       FROM auth_attempts
       WHERE username = ?
       ORDER BY attempted_at DESC
       LIMIT ?`,
      [username, limit]
    );

    return rows.map((row: { success: number; attempted_at: Date | string }) => ({
      success: row.success === 1,
      attemptedAt: new Date(row.attempted_at)
    }));
  }

  public async recordAuthAttempt(params: {
    username: string;
    success: boolean;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await dbPool.query(
      `INSERT INTO auth_attempts (username, success, ip_address, user_agent)
       VALUES (?, ?, ?, ?)`,
      [
        params.username,
        params.success ? 1 : 0,
        params.ipAddress ?? null,
        params.userAgent ?? null
      ]
    );
  }

  public async createSession(params: {
    userId: number;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await dbPool.query(
      'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [params.userId, params.tokenHash, params.expiresAt]
    );
  }

  public async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const [rows] = await dbPool.query<
      {
        user_id: number;
        username: string;
        expires_at: Date | string;
        role_name: RoleName;
      }[]
    >(
      `SELECT s.user_id, u.username, s.expires_at, r.name AS role_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE s.token_hash = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > UTC_TIMESTAMP()
         AND u.is_active = 1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return null;
    }

    const first = rows[0];

    return {
      userId: first.user_id,
      username: first.username,
      roles: rows.map((row: { role_name: RoleName }) => row.role_name),
      expiresAt: new Date(first.expires_at)
    };
  }

  public async revokeSession(tokenHash: string): Promise<void> {
    await dbPool.query(
      `UPDATE sessions
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE token_hash = ? AND revoked_at IS NULL`,
      [tokenHash]
    );
  }

  public async touchSession(tokenHash: string): Promise<void> {
    await dbPool.query(
      `UPDATE sessions
       SET last_seen_at = CURRENT_TIMESTAMP
       WHERE token_hash = ? AND revoked_at IS NULL`,
      [tokenHash]
    );
  }
}