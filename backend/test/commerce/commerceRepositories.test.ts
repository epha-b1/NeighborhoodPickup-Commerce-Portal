import { getActiveCycles } from '../../src/features/commerce/repositories/cycleRepository';
import { getListingsByCycle } from '../../src/features/commerce/repositories/listingRepository';
import { dbPool } from '../../src/db/pool';
import {
  getDailyRemainingCapacity,
  getLatestSnapshotForWindow,
  toggleFavorite
} from '../../src/features/commerce/repositories/pickupPointRepository';

vi.mock('../../src/db/pool', () => ({
  dbPool: {
    query: vi.fn(),
    getConnection: vi.fn()
  }
}));

const mockedDbPool = vi.mocked(dbPool);

describe('commerce repositories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters active cycles by status and date boundaries', async () => {
    mockedDbPool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            name: 'Spring Wave',
            description: 'desc',
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-04-01T00:00:00Z',
            active_listing_count: 2
          }
        ]
      ]);

    const result = await getActiveCycles({
      page: 1,
      pageSize: 10,
      sortBy: 'startsAt',
      sortDir: 'asc'
    });

    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Spring Wave');

    const countSql = mockedDbPool.query.mock.calls[0][0] as string;
    expect(countSql).toContain("WHERE c.status = 'ACTIVE'");
    expect(countSql).toContain('UTC_TIMESTAMP() BETWEEN c.starts_at AND c.ends_at');
  });

  it('maps favorite flags in listing results', async () => {
    mockedDbPool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            cycle_id: 1,
            pickup_point_id: 3,
            pickup_point_name: 'Point A',
            leader_user_id: 7,
            leader_username: 'leader1',
            title: 'Kale',
            description: 'Fresh',
            base_price: '5.99',
            unit_label: 'bundle',
            available_quantity: 20,
            reserved_quantity: 5,
            fav_pickup_point_id: 21,
            fav_leader_id: null
          }
        ]
      ]);

    const result = await getListingsByCycle({
      userId: 1,
      query: {
        cycleId: 1,
        page: 1,
        pageSize: 10,
        sortBy: 'recent',
        sortDir: 'desc'
      }
    });

    expect(result.total).toBe(1);
    expect(result.rows[0].isFavoritePickupPoint).toBe(true);
    expect(result.rows[0].isFavoriteLeader).toBe(false);
  });

  it('toggles favorite persistence off when existing record exists', async () => {
    const mockConn = {
      beginTransaction: vi.fn(),
      query: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn()
    };

    mockedDbPool.query.mockResolvedValueOnce([[{ count: 1 }]]);
    mockedDbPool.getConnection.mockResolvedValueOnce(mockConn);
    mockConn.query.mockResolvedValueOnce([[{ id: 45 }]]).mockResolvedValueOnce([{}]);

    const result = await toggleFavorite({
      userId: 1,
      type: 'PICKUP_POINT',
      targetId: 2
    });

    expect(result.isFavorite).toBe(false);
    expect(mockConn.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM favorites'),
      [1, 2]
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(2, 'DELETE FROM favorites WHERE id = ?', [45]);
    expect(mockConn.commit).toHaveBeenCalled();
  });

  it('returns zero when reserved slots exceed total capacity', async () => {
    mockedDbPool.query.mockResolvedValueOnce([[{ remaining: 0 }]]);

    const remaining = await getDailyRemainingCapacity(9);

    expect(remaining).toBe(0);
    expect(mockedDbPool.query).toHaveBeenCalledWith(
      expect.stringContaining('GREATEST(capacity_total - reserved_slots, 0)'),
      [9]
    );
  });

  it('returns latest capacity snapshot when present', async () => {
    mockedDbPool.query.mockResolvedValueOnce([[{ capacity_total: 10, capacity_reserved: 3 }]]);

    const snapshot = await getLatestSnapshotForWindow(12);

    expect(snapshot).toEqual({
      capacityTotal: 10,
      capacityReserved: 3
    });
  });
});