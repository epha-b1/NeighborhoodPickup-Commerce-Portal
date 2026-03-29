import { getActiveCycles } from '../repositories/cycleRepository';
import { getListingsByCycle } from '../repositories/listingRepository';
import {
  findPickupPointById,
  isFavorite,
  toggleFavorite
} from '../repositories/pickupPointRepository';
import { computeRemainingCapacityToday, computeWindowRemaining } from './capacityService';
import type { FavoriteType, ListQuery, PickupPointDetail } from '../types';
import { recordServerBehaviorEvent } from "../../behavior/services/behaviorService";

export const listActiveBuyingCycles = async (params: {
  page: number;
  pageSize: number;
  sortBy: 'startsAt' | 'endsAt' | 'name';
  sortDir: 'asc' | 'desc';
}) => {
  return getActiveCycles(params);
};

export const listListings = async (params: { userId: number; query: ListQuery }) => {
  return getListingsByCycle(params);
};

export const getPickupPointDetail = async (params: {
  userId: number;
  pickupPointId: number;
}): Promise<PickupPointDetail | null> => {
  const point = await findPickupPointById(params.pickupPointId);
  if (!point) {
    return null;
  }

  const windows = await computeWindowRemaining(point.id);
  const remainingCapacityToday = await computeRemainingCapacityToday(point.id);
  const favorite = await isFavorite({
    userId: params.userId,
    type: 'PICKUP_POINT',
    targetId: point.id
  });

  return {
    id: point.id,
    name: point.name,
    address: {
      line1: point.address_line1,
      line2: point.address_line2,
      city: point.city,
      stateRegion: point.state_region,
      postalCode: point.postal_code
    },
    businessHours: JSON.parse(point.business_hours_json),
    dailyCapacity: Number(point.daily_capacity),
    remainingCapacityToday,
    windows,
    isFavorite: favorite
  };
};

export const toggleFavoriteTarget = async (params: {
  userId: number;
  type: FavoriteType;
  targetId: number;
}) => {
  const result = await toggleFavorite(params);

  await recordServerBehaviorEvent({
    userId: params.userId,
    eventType: "FAVORITE",
    resourceType: params.type,
    resourceId: String(params.targetId),
    metadata: { isFavorite: result.isFavorite }
  });

  return result;
};
