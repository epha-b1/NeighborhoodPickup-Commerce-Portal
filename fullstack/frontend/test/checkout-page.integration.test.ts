/**
 * @vitest-environment jsdom
 */

import { setActivePinia, createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { describe, expect, it, beforeEach, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  params: {},
  query: {
    cycleId: "1",
    pickupPointId: "2",
  },
}));

const getPickupPointMock = vi.hoisted(() => vi.fn());
const quoteMock = vi.hoisted(() => vi.fn());
const checkoutMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../src/api/commerceApi", () => ({
  commerceApi: {
    getPickupPoint: getPickupPointMock,
  },
}));

vi.mock("../src/api/orderApi", () => ({
  orderApi: {
    quote: quoteMock,
    checkout: checkoutMock,
  },
}));

import CheckoutPage from "../src/pages/CheckoutPage.vue";
import { useCheckoutStore } from "../src/stores/checkoutStore";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("CheckoutPage integration", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pushMock.mockReset();
    getPickupPointMock.mockReset();
    quoteMock.mockReset();
    checkoutMock.mockReset();

    const checkoutStore = useCheckoutStore();
    checkoutStore.setListing({
      id: 100,
      cycleId: 1,
      pickupPointId: 2,
      pickupPointName: "West Pickup",
      leaderUserId: 5,
      leaderUsername: "leader-applicant",
      title: "Fresh apples",
      description: null,
      basePrice: "9.99",
      unitLabel: "box",
      availableQuantity: 20,
      reservedQuantity: 2,
      isFavoritePickupPoint: false,
      isFavoriteLeader: false,
    });
  });

  it("shows capacity conflict and lets user switch to an alternative window", async () => {
    getPickupPointMock.mockResolvedValue({
      id: 2,
      name: "West Pickup",
      address: {
        line1: "1 Main",
        line2: null,
        city: "Springfield",
        stateRegion: "IL",
        postalCode: "62701",
      },
      businessHours: {},
      dailyCapacity: 80,
      remainingCapacityToday: 0,
      windows: [
        {
          windowId: 12,
          date: "2026-03-30",
          startTime: "10:00:00",
          endTime: "11:00:00",
          capacityTotal: 30,
          reservedSlots: 30,
          remainingCapacity: 0,
        },
      ],
      isFavorite: false,
    });

    quoteMock
      .mockResolvedValueOnce({
        cycleId: 1,
        pickupPointId: 2,
        taxJurisdiction: { id: 1, code: "US-IL-SPRINGFIELD", rate: 0.08 },
        lineItems: [
          {
            listingId: 100,
            title: "Fresh apples",
            quantity: 1,
            unitPrice: 9.99,
            subtotal: 9.99,
            memberPricingAdjustment: 0,
            tieredDiscount: 0,
            cappedDiscount: 0,
            subsidy: 0,
            taxableBase: 9.99,
            taxAmount: 0.8,
            total: 10.79,
            appliedRules: [],
          },
        ],
        subtotal: 9.99,
        discountTotal: 0,
        subsidyTotal: 0,
        taxTotal: 0.8,
        grandTotal: 10.79,
        trace: { generatedAt: "2026-03-29T00:00:00.000Z", rulesApplied: [] },
      })
      .mockResolvedValueOnce({
        cycleId: 1,
        pickupPointId: 2,
        taxJurisdiction: { id: 1, code: "US-IL-SPRINGFIELD", rate: 0.08 },
        lineItems: [
          {
            listingId: 100,
            title: "Fresh apples",
            quantity: 1,
            unitPrice: 9.99,
            subtotal: 9.99,
            memberPricingAdjustment: 0,
            tieredDiscount: 0,
            cappedDiscount: 0,
            subsidy: 0,
            taxableBase: 9.99,
            taxAmount: 0.8,
            total: 10.79,
            appliedRules: [],
          },
        ],
        subtotal: 9.99,
        discountTotal: 0,
        subsidyTotal: 0,
        taxTotal: 0.8,
        grandTotal: 10.79,
        trace: { generatedAt: "2026-03-29T00:00:00.000Z", rulesApplied: [] },
      });

    checkoutMock.mockResolvedValue({
      ok: false,
      code: "CAPACITY_EXCEEDED",
      message: "Selected pickup window has reached full capacity.",
      conflict: {
        message: "Selected pickup window is full. Choose another window.",
        requestedWindowId: 12,
        alternatives: [
          {
            pickupWindowId: 14,
            windowDate: "2026-03-31",
            startTime: "14:00:00",
            endTime: "15:00:00",
            remainingCapacity: 3,
          },
        ],
      },
    });

    const wrapper = mount(CheckoutPage, {
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    });

    await flush();

    const submitButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Submit Checkout"));

    expect(submitButton).toBeDefined();
    await submitButton!.trigger("click");
    await flush();

    expect(wrapper.text()).toContain("Capacity Conflict");
    expect(wrapper.text()).toContain("Selected pickup window is full");

    const useButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Use");

    expect(useButton).toBeDefined();
    await useButton!.trigger("click");
    await flush();

    expect(quoteMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pickupWindowId: 14,
      }),
    );
  });
});
