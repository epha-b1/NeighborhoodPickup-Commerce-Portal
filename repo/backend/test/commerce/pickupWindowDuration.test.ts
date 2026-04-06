import {
  assertValidPickupWindowDuration,
  createPickupWindow,
} from '../../src/features/commerce/repositories/pickupPointRepository';
import { dbPool } from '../../src/db/pool';

vi.mock('../../src/db/pool', () => ({
  dbPool: { query: vi.fn(), getConnection: vi.fn() },
}));

const mockedDbPool = vi.mocked(dbPool);

describe('pickup window 1-hour duration constraint', () => {
  it('accepts a valid 1-hour window (09:00 to 10:00)', () => {
    expect(() => assertValidPickupWindowDuration('09:00:00', '10:00:00')).not.toThrow();
  });

  it('accepts a valid 1-hour window (13:00 to 14:00)', () => {
    expect(() => assertValidPickupWindowDuration('13:00:00', '14:00:00')).not.toThrow();
  });

  it('accepts short-form time strings (10:00 to 11:00)', () => {
    expect(() => assertValidPickupWindowDuration('10:00', '11:00')).not.toThrow();
  });

  it('rejects a 2-hour window (09:00 to 11:00)', () => {
    expect(() => assertValidPickupWindowDuration('09:00:00', '11:00:00')).toThrow(
      'INVALID_PICKUP_WINDOW_DURATION',
    );
  });

  it('rejects a 30-minute window (09:00 to 09:30)', () => {
    expect(() => assertValidPickupWindowDuration('09:00:00', '09:30:00')).toThrow(
      'INVALID_PICKUP_WINDOW_DURATION',
    );
  });

  it('rejects a 90-minute window (09:00 to 10:30)', () => {
    expect(() => assertValidPickupWindowDuration('09:00:00', '10:30:00')).toThrow(
      'INVALID_PICKUP_WINDOW_DURATION',
    );
  });

  it('rejects when end time equals start time (zero duration)', () => {
    expect(() => assertValidPickupWindowDuration('09:00:00', '09:00:00')).toThrow(
      'INVALID_PICKUP_WINDOW_DURATION',
    );
  });

  it('rejects when end time is before start time (negative duration)', () => {
    expect(() => assertValidPickupWindowDuration('10:00:00', '09:00:00')).toThrow(
      'INVALID_PICKUP_WINDOW_DURATION',
    );
  });
});

describe('createPickupWindow repository function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a valid 1-hour window into the database', async () => {
    mockedDbPool.query.mockResolvedValueOnce([{ insertId: 99 }] as any);

    const result = await createPickupWindow({
      pickupPointId: 1,
      windowDate: '2026-05-01',
      startTime: '09:00:00',
      endTime: '10:00:00',
      capacityTotal: 50,
    });

    expect(result.id).toBe(99);
    expect(mockedDbPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO pickup_windows'),
      [1, '2026-05-01', '09:00:00', '10:00:00', 50],
    );
  });

  it('rejects a 2-hour window before reaching the database', async () => {
    await expect(
      createPickupWindow({
        pickupPointId: 1,
        windowDate: '2026-05-01',
        startTime: '09:00:00',
        endTime: '11:00:00',
        capacityTotal: 50,
      }),
    ).rejects.toThrow('INVALID_PICKUP_WINDOW_DURATION');

    expect(mockedDbPool.query).not.toHaveBeenCalled();
  });
});
