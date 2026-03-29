import { dbPool } from '../../../db/pool';
import type { ActiveCycle } from '../types';

export const getActiveCycles = async (params: {
  page: number;
  pageSize: number;
  sortBy: 'startsAt' | 'endsAt' | 'name';
  sortDir: 'asc' | 'desc';
}): Promise<{ rows: ActiveCycle[]; total: number }> => {
  const offset = (params.page - 1) * params.pageSize;

  const sortColumns: Record<typeof params.sortBy, string> = {
    startsAt: 'c.starts_at',
    endsAt: 'c.ends_at',
    name: 'c.name'
  };

  const sortSql = `${sortColumns[params.sortBy]} ${params.sortDir.toUpperCase()}`;

  const [countRows] = await dbPool.query<{ total: number }[]>(
    `SELECT COUNT(*) AS total
     FROM buying_cycles c
     WHERE c.status = 'ACTIVE'
       AND UTC_TIMESTAMP() BETWEEN c.starts_at AND c.ends_at`
  );

  const [rows] = await dbPool.query<
    {
      id: number;
      name: string;
      description: string | null;
      starts_at: Date | string;
      ends_at: Date | string;
      active_listing_count: number;
    }[]
  >(
    `SELECT c.id,
            c.name,
            c.description,
            c.starts_at,
            c.ends_at,
            COUNT(l.id) AS active_listing_count
     FROM buying_cycles c
     LEFT JOIN listings l ON l.cycle_id = c.id AND l.status = 'ACTIVE'
     WHERE c.status = 'ACTIVE'
       AND UTC_TIMESTAMP() BETWEEN c.starts_at AND c.ends_at
     GROUP BY c.id
     ORDER BY ${sortSql}
     LIMIT ? OFFSET ?`,
    [params.pageSize, offset]
  );

  return {
    total: Number(countRows[0]?.total ?? 0),
    rows: rows.map(
      (row: {
        id: number;
        name: string;
        description: string | null;
        starts_at: Date | string;
        ends_at: Date | string;
        active_listing_count: number;
      }) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        startsAt: new Date(row.starts_at).toISOString(),
        endsAt: new Date(row.ends_at).toISOString(),
        activeListingCount: Number(row.active_listing_count)
      })
    )
  };
};