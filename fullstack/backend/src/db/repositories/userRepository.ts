import { dbPool } from '../pool';
import { ROLE_NAMES, type RoleName } from '../../auth/roles';

export type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  is_active: number;
};

const resolveRoleIds = async (): Promise<Map<RoleName, number>> => {
  const [roles] = await dbPool.query<{ id: number; name: RoleName }[]>(
    'SELECT id, name FROM roles WHERE name IN (?)',
    [ROLE_NAMES]
  );

  const map = new Map<RoleName, number>();
  for (const role of roles) {
    map.set(role.name, role.id);
  }

  return map;
};

export const findUserByUsername = async (
  username: string
): Promise<UserRow | null> => {
  const [rows] = await dbPool.query<UserRow[]>(
    'SELECT id, username, password_hash, is_active FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  return rows[0] ?? null;
};

export const findUserById = async (id: number): Promise<UserRow | null> => {
  const [rows] = await dbPool.query<UserRow[]>(
    'SELECT id, username, password_hash, is_active FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] ?? null;
};

export const getUserRoles = async (userId: number): Promise<RoleName[]> => {
  const [rows] = await dbPool.query<{ name: RoleName }[]>(
    `SELECT r.name
     FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ?`,
    [userId]
  );

  return rows.map((row: { name: RoleName }) => row.name);
};

export const createUserWithRole = async (params: {
  username: string;
  passwordHash: string;
  role: RoleName;
}): Promise<void> => {
  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query<{ id: number }[]>(
      'SELECT id FROM users WHERE username = ? LIMIT 1',
      [params.username]
    );

    if (existingRows.length > 0) {
      await conn.commit();
      return;
    }

    const [insertUser] = await conn.query<any>(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [params.username, params.passwordHash]
    );
    const userId = Number(insertUser.insertId);

    const roleIds = await resolveRoleIds();
    const roleId = roleIds.get(params.role);
    if (!roleId) {
      throw new Error(`Role not found: ${params.role}`);
    }

    await conn.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      userId,
      roleId
    ]);

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};