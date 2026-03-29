import { dbPool } from '../pool';

export const recordAuthAttempt = async (params: {
  username: string;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> => {
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
};

export const countRecentFailedAttempts = async (params: {
  username: string;
  from: Date;
}): Promise<number> => {
  const [rows] = await dbPool.query<{ total: number }[]>(
    `SELECT COUNT(*) AS total
     FROM auth_attempts
     WHERE username = ? AND success = 0 AND attempted_at >= ?`,
    [params.username, params.from]
  );

  return Number(rows[0]?.total ?? 0);
};