import { apiRequest } from './client';
import type { CheckoutResponse, LedgerRow, OrderDetail, OrderQuote } from '../types/orders';

type CheckoutPayload = {
  cycleId: number;
  pickupPointId: number;
  pickupWindowId: number;
  taxJurisdictionCode: string;
  items: Array<{ listingId: number; quantity: number }>;
};

export const orderApi = {
  quote: (payload: CheckoutPayload) =>
    apiRequest<OrderQuote>('/orders/quote', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  checkout: (payload: CheckoutPayload) =>
    apiRequest<CheckoutResponse>('/orders/checkout', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getOrder: (orderId: number) => apiRequest<OrderDetail>(`/orders/${orderId}`),
  getLedger: () => apiRequest<{ data: LedgerRow[] }>('/finance/ledger')
};