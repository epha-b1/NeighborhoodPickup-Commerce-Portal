/**
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());
const getActiveCyclesMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../src/api/commerceApi", () => ({
  commerceApi: {
    getActiveCycles: getActiveCyclesMock,
  },
}));

import ActiveCyclesPage from "../src/pages/ActiveCyclesPage.vue";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("ActiveCyclesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders cycles table with sort and pagination", async () => {
    getActiveCyclesMock.mockResolvedValue({
      data: [
        {
          id: 1,
          name: "Spring Harvest",
          description: "Fresh produce",
          startsAt: "2026-04-01T00:00:00.000Z",
          endsAt: "2026-04-15T00:00:00.000Z",
          activeListingCount: 12,
        },
        {
          id: 2,
          name: "Summer Bundle",
          description: null,
          startsAt: "2026-05-01T00:00:00.000Z",
          endsAt: "2026-05-20T00:00:00.000Z",
          activeListingCount: 5,
        },
      ],
      page: 1,
      pageSize: 10,
      total: 2,
    });

    const wrapper = mount(ActiveCyclesPage);
    await flush();

    expect(wrapper.text()).toContain("Spring Harvest");
    expect(wrapper.text()).toContain("Summer Bundle");
    expect(wrapper.text()).toContain("12");
    expect(wrapper.text()).toContain("5");
    expect(wrapper.text()).toContain("Page 1 of 1");
  });

  it("navigates to listings when View Listings is clicked", async () => {
    getActiveCyclesMock.mockResolvedValue({
      data: [
        {
          id: 7,
          name: "Test Cycle",
          description: null,
          startsAt: "2026-04-01T00:00:00.000Z",
          endsAt: "2026-04-10T00:00:00.000Z",
          activeListingCount: 3,
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
    });

    const wrapper = mount(ActiveCyclesPage);
    await flush();

    const viewBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("View Listings"));
    expect(viewBtn).toBeDefined();
    await viewBtn!.trigger("click");
    await flush();

    expect(pushMock).toHaveBeenCalledWith({
      name: "listings",
      query: { cycleId: "7" },
    });
  });

  it("shows empty state when no active cycles", async () => {
    getActiveCyclesMock.mockResolvedValue({
      data: [],
      page: 1,
      pageSize: 10,
      total: 0,
    });

    const wrapper = mount(ActiveCyclesPage);
    await flush();

    expect(wrapper.text()).toContain("No active cycles available");
  });
});
