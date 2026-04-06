import { dbPool } from '../../../db/pool';
import type { ActiveCycle, BuyingCycleStatus } from '../types';

const VALID_TRANSITIONS: Record<BuyingCycleStatus, BuyingCycleStatus[]> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['CLOSED'],
  CLOSED: ['FULFILLED'],
  FULFILLED: ['ARCHIVED'],
  ARCHIVED: [],
};

export const getCycleById = async (
  cycleId: number,
): Promise<{ id: number; status: BuyingCycleStatus; endsAt: string } | null> => {
  const [rows] = await dbPool.query<
    { id: number; status: BuyingCycleStatus; ends_at: Date | string }[]
  >(
    'SELECT id, status, ends_at FROM buying_cycles WHERE id = ? LIMIT 1',
    [cycleId],
  );
  if (rows.length === 0) return null;
  return {
    id: rows[0].id,
    status: rows[0].status,
    endsAt: new Date(rows[0].ends_at).toISOString(),
  };
};

export const transitionCycleStatus = async (params: {
  cycleId: number;
  toStatus: BuyingCycleStatus;
}): Promise<{ cycleId: number; fromStatus: BuyingCycleStatus; toStatus: BuyingCycleStatus }> => {
  const cycle = await getCycleById(params.cycleId);
  if (!cycle) {
    throw new Error('CYCLE_NOT_FOUND');
  }

  const allowed = VALID_TRANSITIONS[cycle.status];
  if (!allowed.includes(params.toStatus)) {
    throw new Error('INVALID_CYCLE_TRANSITION');
  }

  const closedAtClause = params.toStatus === 'CLOSED' ? ', closed_at = UTC_TIMESTAMP()' : '';
  await dbPool.query(
    `UPDATE buying_cycles SET status = ?${closedAtClause} WHERE id = ?`,
    [params.toStatus, params.cycleId],
  );

  return {
    cycleId: params.cycleId,
    fromStatus: cycle.status,
    toStatus: params.toStatus,
  };
};

export const isCycleActiveForCheckout = async (cycleId: number): Promise<boolean> => {
  const [rows] = await dbPool.query<{ ok: number }[]>(
    `SELECT 1 AS ok FROM buying_cycles
     WHERE id = ? AND status = 'ACTIVE' AND UTC_TIMESTAMP() BETWEEN starts_at AND ends_at
     LIMIT 1`,
    [cycleId],
  );
  return rows.length > 0;
};

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