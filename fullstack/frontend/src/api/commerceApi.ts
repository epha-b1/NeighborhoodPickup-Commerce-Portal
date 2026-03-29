import { apiRequest } from './client';
import type {
  BuyingCycleSummary,
  ListingItem,
  PagedResult,
  PickupPointDetail
} from '../types/commerce';

export const commerceApi = {
  getActiveCycles: (params: {
    page: number;
    pageSize: number;
    sortBy: 'startsAt' | 'endsAt' | 'name';
    sortDir: 'asc' | 'desc';
  }) => {
    const search = new URLSearchParams({
      page: String(params.page),
      pageSize: String(params.pageSize),
      sortBy: params.sortBy,
      sortDir: params.sortDir
    });
    return apiRequest<PagedResult<BuyingCycleSummary>>(`/buying-cycles/active?${search.toString()}`);
  },
  getListings: (params: {
    cycleId: number;
    page: number;
    pageSize: number;
    search?: string;
    sortBy: 'title' | 'price' | 'recent';
    sortDir: 'asc' | 'desc';
  }) => {
    const search = new URLSearchParams({
      cycleId: String(params.cycleId),
      page: String(params.page),
      pageSize: String(params.pageSize),
      sortBy: params.sortBy,
      sortDir: params.sortDir
    });

    if (params.search && params.search.trim()) {
      search.set('search', params.search.trim());
    }

    return apiRequest<PagedResult<ListingItem>>(`/listings?${search.toString()}`);
  },
  getPickupPoint: (id: number) => apiRequest<PickupPointDetail>(`/pickup-points/${id}`),
  toggleFavorite: (payload: { type: 'PICKUP_POINT' | 'LEADER'; targetId: number }) =>
    apiRequest<{ type: 'PICKUP_POINT' | 'LEADER'; targetId: number; isFavorite: boolean }>(
      '/favorites/toggle',
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    )
};