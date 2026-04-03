/**
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  params: { id: "2" },
  query: {},
}));

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: vi.fn() }),
}));

const getPickupPointMock = vi.hoisted(() => vi.fn());
const toggleFavoriteMock = vi.hoisted(() => vi.fn());

vi.mock("../src/api/commerceApi", () => ({
  commerceApi: {
    getPickupPoint: getPickupPointMock,
    toggleFavorite: toggleFavoriteMock,
  },
}));

import PickupPointDetailPage from "../src/pages/PickupPointDetailPage.vue";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const samplePickupPoint = {
  id: 2,
  name: "West Community Center",
  address: {
    line1: "123 Main St",
    line2: null,
    city: "Springfield",
    stateRegion: "IL",
    postalCode: "62701",
  },
  businessHours: {
    Monday: ["9:00 AM - 5:00 PM"],
    Tuesday: ["9:00 AM - 5:00 PM"],
  },
  dailyCapacity: 80,
  remainingCapacityToday: 35,
  windows: [
    {
      windowId: 10,
      date: "2026-04-05",
      startTime: "10:00:00",
      endTime: "11:00:00",
      capacityTotal: 30,
      reservedSlots: 12,
      remainingCapacity: 18,
    },
    {
      windowId: 11,
      date: "2026-04-05",
      startTime: "14:00:00",
      endTime: "15:00:00",
      capacityTotal: 30,
      reservedSlots: 30,
      remainingCapacity: 0,
    },
  ],
  isFavorite: false,
};

describe("PickupPointDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders pickup point details with capacity and windows", async () => {
    getPickupPointMock.mockResolvedValue(samplePickupPoint);

    const wrapper = mount(PickupPointDetailPage);
    await flush();

    expect(wrapper.text()).toContain("West Community Center");
    expect(wrapper.text()).toContain("123 Main St");
    expect(wrapper.text()).toContain("Springfield");
    expect(wrapper.text()).toContain("80");
    expect(wrapper.text()).toContain("35");
    expect(wrapper.text()).toContain("18");
    expect(wrapper.text()).toContain("0"); // remaining for second window
    expect(wrapper.text()).toContain("Favorite Pickup Point");
  });

  it("toggles favorite and refreshes", async () => {
    getPickupPointMock.mockResolvedValue(samplePickupPoint);
    toggleFavoriteMock.mockResolvedValue({
      type: "PICKUP_POINT",
      targetId: 2,
      isFavorite: true,
    });

    const wrapper = mount(PickupPointDetailPage);
    await flush();

    const favBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Favorite Pickup Point"));
    expect(favBtn).toBeDefined();
    await favBtn!.trigger("click");
    await flush();

    expect(toggleFavoriteMock).toHaveBeenCalledWith({
      type: "PICKUP_POINT",
      targetId: 2,
    });
    expect(getPickupPointMock).toHaveBeenCalledTimes(2);
  });

  it("shows error when pickup point fetch fails", async () => {
    getPickupPointMock.mockRejectedValue(new Error("Not found"));

    const wrapper = mount(PickupPointDetailPage);
    await flush();

    expect(wrapper.text()).toContain("Not found");
  });
});
