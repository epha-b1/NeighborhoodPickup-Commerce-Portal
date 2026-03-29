export type FavoriteType = 'PICKUP_POINT' | 'LEADER';

export type ActiveCycle = {
  id: number;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  activeListingCount: number;
};

export type ListingSummary = {
  id: number;
  cycleId: number;
  pickupPointId: number;
  pickupPointName: string;
  leaderUserId: number;
  leaderUsername: string;
  title: string;
  description: string | null;
  basePrice: string;
  unitLabel: string;
  availableQuantity: number;
  reservedQuantity: number;
  isFavoritePickupPoint: boolean;
  isFavoriteLeader: boolean;
};

export type PickupWindowCapacity = {
  windowId: number;
  date: string;
  startTime: string;
  endTime: string;
  capacityTotal: number;
  reservedSlots: number;
  remainingCapacity: number;
};

export type PickupPointDetail = {
  id: number;
  name: string;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    stateRegion: string;
    postalCode: string;
  };
  businessHours: Record<string, string[]>;
  dailyCapacity: number;
  remainingCapacityToday: number;
  windows: PickupWindowCapacity[];
  isFavorite: boolean;
};

export type ListQuery = {
  cycleId: number;
  page: number;
  pageSize: number;
  search?: string;
  sortBy: 'title' | 'price' | 'recent';
  sortDir: 'asc' | 'desc';
};

export type ToggleFavoriteInput =
  | {
      type: 'PICKUP_POINT';
      targetId: number;
    }
  | {
      type: 'LEADER';
      targetId: number;
    };