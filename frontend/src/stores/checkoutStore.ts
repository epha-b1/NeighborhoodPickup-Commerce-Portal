import { defineStore } from 'pinia';
import type { ListingItem, PickupPointDetail } from '../types/commerce';

export const useCheckoutStore = defineStore('checkout', {
  state: () => ({
    selectedListing: null as ListingItem | null,
    selectedPickupPoint: null as PickupPointDetail | null,
    quantity: 1,
    selectedWindowId: null as number | null
  }),
  actions: {
    setListing(listing: ListingItem) {
      this.selectedListing = listing;
    },
    setPickupPoint(point: PickupPointDetail) {
      this.selectedPickupPoint = point;
      if (!this.selectedWindowId && point.windows.length > 0) {
        this.selectedWindowId = point.windows[0].windowId;
      }
    },
    setQuantity(quantity: number) {
      this.quantity = quantity;
    },
    setWindow(windowId: number) {
      this.selectedWindowId = windowId;
    },
    clear() {
      this.selectedListing = null;
      this.selectedPickupPoint = null;
      this.quantity = 1;
      this.selectedWindowId = null;
    }
  }
});