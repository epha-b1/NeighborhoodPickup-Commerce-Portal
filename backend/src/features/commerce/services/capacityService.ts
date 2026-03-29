import {
  getDailyRemainingCapacity,
  getLatestSnapshotForWindow,
  listPickupWindowsByPoint
} from '../repositories/pickupPointRepository';
import type { PickupWindowCapacity } from '../types';

export const computeWindowRemaining = async (pickupPointId: number): Promise<PickupWindowCapacity[]> => {
  const windows = await listPickupWindowsByPoint(pickupPointId);

  const transformed: PickupWindowCapacity[] = [];

  for (const window of windows) {
    const snapshot = await getLatestSnapshotForWindow(window.id);
    const capacityTotal = snapshot?.capacityTotal ?? Number(window.capacity_total);
    const reservedSlots = snapshot?.capacityReserved ?? Number(window.reserved_slots);
    const remainingCapacity = Math.max(capacityTotal - reservedSlots, 0);

    transformed.push({
      windowId: window.id,
      date: window.window_date,
      startTime: window.start_time,
      endTime: window.end_time,
      capacityTotal,
      reservedSlots,
      remainingCapacity
    });
  }

  return transformed;
};

export const computeRemainingCapacityToday = async (pickupPointId: number): Promise<number> => {
  return getDailyRemainingCapacity(pickupPointId);
};