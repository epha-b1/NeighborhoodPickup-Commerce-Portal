import { dbPool } from '../../../db/pool';
import type { ListQuery, ListingSummary } from '../types';

export const getListingsByCycle = async (params: {
  userId: number;
  query: ListQuery;
}): Promise<{ rows: ListingSummary[]; total: number }> => {
  const { userId, query } = params;
  const offset = (query.page - 1) * query.pageSize;

  const whereParts: string[] = ['l.cycle_id = ?', "l.status = 'ACTIVE'"];
  const values: Array<number | string> = [query.cycleId];

  if (query.search && query.search.trim().length > 0) {
    whereParts.push('(l.title LIKE ? OR l.description LIKE ?)');
    const pattern = `%${query.search.trim()}%`;
    values.push(pattern, pattern);
  }

  const whereSql = whereParts.join(' AND ');

  const sortColumns: Record<ListQuery['sortBy'], string> = {
    title: 'l.title',
    price: 'l.base_price',
    recent: 'l.created_at'
  };

  const sortSql = `${sortColumns[query.sortBy]} ${query.sortDir.toUpperCase()}`;

  const [countRows] = await dbPool.query<{ total: number }[]>(
    `SELECT COUNT(*) AS total
     FROM listings l
     WHERE ${whereSql}`,
    values
  );

  const [rows] = await dbPool.query<
    {
      id: number;
      cycle_id: number;
      pickup_point_id: number;
      pickup_point_name: string;
      leader_user_id: number;
      leader_username: string;
      title: string;
      description: string | null;
      base_price: string;
      unit_label: string;
      available_quantity: number;
      reserved_quantity: number;
      fav_pickup_point_id: number | null;
      fav_leader_id: number | null;
    }[]
  >(
    `SELECT l.id,
            l.cycle_id,
            p.id AS pickup_point_id,
            p.name AS pickup_point_name,
            u.id AS leader_user_id,
            u.username AS leader_username,
            l.title,
            l.description,
            l.base_price,
            l.unit_label,
            COALESCE(li.available_quantity, 0) AS available_quantity,
            COALESCE(li.reserved_quantity, 0) AS reserved_quantity,
            fp.id AS fav_pickup_point_id,
            fl.id AS fav_leader_id
     FROM listings l
     JOIN pickup_points p ON p.id = l.pickup_point_id
     JOIN users u ON u.id = l.leader_user_id
     LEFT JOIN listing_inventory li ON li.listing_id = l.id
     LEFT JOIN favorites fp
       ON fp.user_id = ?
      AND fp.pickup_point_id = p.id
      AND fp.leader_user_id IS NULL
     LEFT JOIN favorites fl
       ON fl.user_id = ?
      AND fl.leader_user_id = u.id
      AND fl.pickup_point_id IS NULL
     WHERE ${whereSql}
     ORDER BY ${sortSql}
     LIMIT ? OFFSET ?`,
    [userId, userId, ...values, query.pageSize, offset]
  );

  return {
    total: Number(countRows[0]?.total ?? 0),
    rows: rows.map(
      (row: {
        id: number;
        cycle_id: number;
        pickup_point_id: number;
        pickup_point_name: string;
        leader_user_id: number;
        leader_username: string;
        title: string;
        description: string | null;
        base_price: string;
        unit_label: string;
        available_quantity: number;
        reserved_quantity: number;
        fav_pickup_point_id: number | null;
        fav_leader_id: number | null;
      }) => ({
        id: row.id,
        cycleId: row.cycle_id,
        pickupPointId: row.pickup_point_id,
        pickupPointName: row.pickup_point_name,
        leaderUserId: row.leader_user_id,
        leaderUsername: row.leader_username,
        title: row.title,
        description: row.description,
        basePrice: row.base_price,
        unitLabel: row.unit_label,
        availableQuantity: Number(row.available_quantity),
        reservedQuantity: Number(row.reserved_quantity),
        isFavoritePickupPoint: row.fav_pickup_point_id !== null,
        isFavoriteLeader: row.fav_leader_id !== null
      })
    )
  };
};