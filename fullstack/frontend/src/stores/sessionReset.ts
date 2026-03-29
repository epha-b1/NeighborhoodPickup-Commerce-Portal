import { useCheckoutStore } from "./checkoutStore";

export const resetUserScopedStores = (): void => {
  useCheckoutStore().clear();
};
