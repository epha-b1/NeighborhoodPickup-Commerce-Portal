import { computeWindowRemaining } from '../../src/features/commerce/services/capacityService';
import * as pickupRepo from '../../src/features/commerce/repositories/pickupPointRepository';

vi.mock('../../src/features/commerce/repositories/pickupPointRepository');

const mockedRepo = vi.mocked(pickupRepo);

describe('capacity service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses snapshot values when available', async () => {
    mockedRepo.listPickupWindowsByPoint.mockResolvedValueOnce([
      {
        id: 1,
        pickup_point_id: 2,
        window_date: '2026-03-26',
        start_time: '09:00:00',
        end_time: '11:00:00',
        capacity_total: 50,
        reserved_slots: 49
      }
    ]);

    mockedRepo.getLatestSnapshotForWindow.mockResolvedValueOnce({
      capacityTotal: 40,
      capacityReserved: 38
    });

    const windows = await computeWindowRemaining(2);

    expect(windows).toEqual([
      {
        windowId: 1,
        date: '2026-03-26',
        startTime: '09:00:00',
        endTime: '11:00:00',
        capacityTotal: 40,
        reservedSlots: 38,
        remainingCapacity: 2
      }
    ]);
  });

  it('never returns negative remaining capacity', async () => {
    mockedRepo.listPickupWindowsByPoint.mockResolvedValueOnce([
      {
        id: 2,
        pickup_point_id: 2,
        window_date: '2026-03-26',
        start_time: '11:00:00',
        end_time: '13:00:00',
        capacity_total: 30,
        reserved_slots: 33
      }
    ]);

    mockedRepo.getLatestSnapshotForWindow.mockResolvedValueOnce(null);

    const windows = await computeWindowRemaining(2);

    expect(windows[0].remainingCapacity).toBe(0);
  });
});