import { dbPool } from '../../../db/pool';
import type { FavoriteType } from '../types';

export type PickupPointRow = {
  id: number;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state_region: string;
  postal_code: string;
  business_hours_json: string;
  daily_capacity: number;
};

export type PickupWindowRow = {
  id: number;
  pickup_point_id: number;
  window_date: string;
  start_time: string;
  end_time: string;
  capacity_total: number;
  reserved_slots: number;
};

export const findPickupPointById = async (id: number): Promise<PickupPointRow | null> => {
  const [rows] = await dbPool.query<PickupPointRow[]>(
    `SELECT id,
            name,
            address_line1,
            address_line2,
            city,
            state_region,
            postal_code,
            business_hours_json,
            daily_capacity
     FROM pickup_points
     WHERE id = ? AND is_active = 1
     LIMIT 1`,
    [id]
  );

  return rows[0] ?? null;
};

export const listPickupWindowsByPoint = async (
  pickupPointId: number,
  daysAhead = 7
): Promise<PickupWindowRow[]> => {
  const [rows] = await dbPool.query<PickupWindowRow[]>(
    `SELECT id,
            pickup_point_id,
            DATE_FORMAT(window_date, '%Y-%m-%d') AS window_date,
            TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
            TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
            capacity_total,
            reserved_slots
     FROM pickup_windows
     WHERE pickup_point_id = ?
       AND window_date BETWEEN UTC_DATE() AND DATE_ADD(UTC_DATE(), INTERVAL ? DAY)
     ORDER BY window_date ASC, start_time ASC`,
    [pickupPointId, daysAhead]
  );

  return rows;
};

export const isFavorite = async (params: {
  userId: number;
  type: FavoriteType;
  targetId: number;
}): Promise<boolean> => {
  const whereColumn = params.type === 'PICKUP_POINT' ? 'pickup_point_id' : 'leader_user_id';
  const nullColumn = params.type === 'PICKUP_POINT' ? 'leader_user_id' : 'pickup_point_id';

  const [rows] = await dbPool.query<{ count: number }[]>(
    `SELECT COUNT(*) AS count
     FROM favorites
     WHERE user_id = ?
       AND ${whereColumn} = ?
       AND ${nullColumn} IS NULL`,
    [params.userId, params.targetId]
  );

  return Number(rows[0]?.count ?? 0) > 0;
};

const ensureFavoriteTargetExists = async (params: {
  type: FavoriteType;
  targetId: number;
}): Promise<void> => {
  if (params.type === 'PICKUP_POINT') {
    const [rows] = await dbPool.query<{ count: number }[]>(
      'SELECT COUNT(*) AS count FROM pickup_points WHERE id = ? AND is_active = 1',
      [params.targetId]
    );
    if (Number(rows[0]?.count ?? 0) === 0) {
      throw new Error('Favorite target pickup point not found.');
    }
    return;
  }

  const [rows] = await dbPool.query<{ count: number }[]>(
    `SELECT COUNT(*) AS count
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u.id = ? AND u.is_active = 1 AND r.name = 'GROUP_LEADER'`,
    [params.targetId]
  );

  if (Number(rows[0]?.count ?? 0) === 0) {
    throw new Error('Favorite target leader not found.');
  }
};

export const toggleFavorite = async (params: {
  userId: number;
  type: FavoriteType;
  targetId: number;
}): Promise<{ isFavorite: boolean }> => {
  await ensureFavoriteTargetExists({
    type: params.type,
    targetId: params.targetId
  });

  const column = params.type === 'PICKUP_POINT' ? 'pickup_point_id' : 'leader_user_id';
  const nullColumn = params.type === 'PICKUP_POINT' ? 'leader_user_id' : 'pickup_point_id';

  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query<{ id: number }[]>(
      `SELECT id
       FROM favorites
       WHERE user_id = ?
         AND ${column} = ?
         AND ${nullColumn} IS NULL
       LIMIT 1`,
      [params.userId, params.targetId]
    );

    if (existingRows.length > 0) {
      await conn.query('DELETE FROM favorites WHERE id = ?', [existingRows[0].id]);
      await conn.commit();
      return { isFavorite: false };
    }

    if (params.type === 'PICKUP_POINT') {
      await conn.query(
        'INSERT INTO favorites (user_id, pickup_point_id, leader_user_id) VALUES (?, ?, NULL)',
        [params.userId, params.targetId]
      );
    } else {
      await conn.query(
        'INSERT INTO favorites (user_id, pickup_point_id, leader_user_id) VALUES (?, NULL, ?)',
        [params.userId, params.targetId]
      );
    }

    await conn.commit();
    return { isFavorite: true };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

export const getDailyRemainingCapacity = async (pickupPointId: number): Promise<number> => {
  const [rows] = await dbPool.query<{ remaining: number }[]>(
    `SELECT COALESCE(SUM(GREATEST(capacity_total - reserved_slots, 0)), 0) AS remaining
     FROM pickup_windows
     WHERE pickup_point_id = ?
       AND window_date = UTC_DATE()`,
    [pickupPointId]
  );

  return Number(rows[0]?.remaining ?? 0);
};

export const getLatestSnapshotForWindow = async (
  pickupWindowId: number
): Promise<{ capacityTotal: number; capacityReserved: number } | null> => {
  const [rows] = await dbPool.query<{ capacity_total: number; capacity_reserved: number }[]>(
    `SELECT capacity_total, capacity_reserved
     FROM pickup_capacity_snapshots
     WHERE pickup_window_id = ?
     ORDER BY snapshot_at DESC
     LIMIT 1`,
    [pickupWindowId]
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    capacityTotal: Number(rows[0].capacity_total),
    capacityReserved: Number(rows[0].capacity_reserved)
  };
};