/**
 * @vitest-environment jsdom
 */

import { setActivePinia, createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());
const routeState = vi.hoisted(() => ({
  params: {},
  query: { cycleId: "3" },
}));

const getListingsMock = vi.hoisted(() => vi.fn());
const toggleFavoriteMock = vi.hoisted(() => vi.fn());
const resolveThreadMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../src/api/commerceApi", () => ({
  commerceApi: {
    getListings: getListingsMock,
    toggleFavorite: toggleFavoriteMock,
  },
}));

vi.mock("../src/api/discussionApi", () => ({
  discussionApi: {
    resolveThread: resolveThreadMock,
  },
}));

vi.mock("../src/telemetry/trackEvent", () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

import ListingsPage from "../src/pages/ListingsPage.vue";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const sampleListing = {
  id: 10,
  cycleId: 3,
  pickupPointId: 2,
  pickupPointName: "West Pickup",
  leaderUserId: 5,
  leaderUsername: "leader1",
  title: "Fresh Apples",
  description: "Organic apples",
  basePrice: "4.99",
  unitLabel: "lb",
  availableQuantity: 50,
  reservedQuantity: 5,
  isFavoritePickupPoint: false,
  isFavoriteLeader: true,
};

describe("ListingsPage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders listings with favorite and discussion actions", async () => {
    getListingsMock.mockResolvedValue({
      data: [sampleListing],
      page: 1,
      pageSize: 10,
      total: 1,
    });

    const wrapper = mount(ListingsPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("Fresh Apples");
    expect(wrapper.text()).toContain("$4.99");
    expect(wrapper.text()).toContain("West Pickup");
    expect(wrapper.text()).toContain("45"); // available - reserved
    expect(wrapper.text()).toContain("Favorite Pickup Point");
    expect(wrapper.text()).toContain("Unfavorite Leader");
    expect(wrapper.text()).toContain("Open Discussion");
  });

  it("toggles favorite and refreshes listings", async () => {
    getListingsMock.mockResolvedValue({
      data: [sampleListing],
      page: 1,
      pageSize: 10,
      total: 1,
    });
    toggleFavoriteMock.mockResolvedValue({
      type: "PICKUP_POINT",
      targetId: 2,
      isFavorite: true,
    });

    const wrapper = mount(ListingsPage, {
      global: { stubs: { RouterLink: true } },
    });
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
    // Should refresh listings after toggle
    expect(getListingsMock).toHaveBeenCalledTimes(2);
  });

  it("opens listing discussion thread", async () => {
    getListingsMock.mockResolvedValue({
      data: [sampleListing],
      page: 1,
      pageSize: 10,
      total: 1,
    });
    resolveThreadMock.mockResolvedValue({
      discussionId: 77,
      contextType: "LISTING",
      contextId: 10,
    });

    const wrapper = mount(ListingsPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    const discussionBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Open Discussion"));
    await discussionBtn!.trigger("click");
    await flush();

    expect(resolveThreadMock).toHaveBeenCalledWith({
      contextType: "LISTING",
      contextId: 10,
    });
    expect(pushMock).toHaveBeenCalledWith({
      name: "discussion-thread",
      params: { id: "77" },
    });
  });

  it("shows error when cycle ID is missing", async () => {
    routeState.query = { cycleId: undefined as any };

    const wrapper = mount(ListingsPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("Missing cycleId");
    routeState.query = { cycleId: "3" }; // restore
  });
});
