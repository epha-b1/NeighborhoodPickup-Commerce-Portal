export type BuyingCycleSummary = {
  id: number;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  activeListingCount: number;
};

export type ListingItem = {
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

export type PagedResult<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
};