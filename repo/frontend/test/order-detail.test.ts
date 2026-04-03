/**
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  params: { id: "42" },
  query: {},
}));

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: pushMock }),
  RouterLink: { template: "<a><slot /></a>" },
}));

const getOrderMock = vi.hoisted(() => vi.fn());
const resolveThreadMock = vi.hoisted(() => vi.fn());

vi.mock("../src/api/orderApi", () => ({
  orderApi: {
    getOrder: getOrderMock,
  },
}));

vi.mock("../src/api/discussionApi", () => ({
  discussionApi: {
    resolveThread: resolveThreadMock,
  },
}));

vi.mock("../src/stores/authStore", () => ({
  useAuthStore: () => ({
    roles: ["MEMBER"],
  }),
}));

import OrderDetailPage from "../src/pages/OrderDetailPage.vue";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const sampleOrder = {
  id: 42,
  userId: 1,
  cycleId: 1,
  pickupPointId: 2,
  status: "CONFIRMED",
  pickupWindow: {
    date: "2026-04-05",
    startTime: "10:00:00",
    endTime: "11:00:00",
  },
  totals: {
    subtotal: 29.97,
    discount: 2.0,
    subsidy: 1.0,
    tax: 2.16,
    total: 29.13,
  },
  items: [
    {
      listingId: 100,
      quantity: 3,
      unitPrice: 9.99,
      lineSubtotal: 29.97,
      lineDiscount: 2.0,
      lineSubsidy: 1.0,
      lineTax: 2.16,
      lineTotal: 29.13,
    },
  ],
  pricingTrace: { generatedAt: "2026-04-01T00:00:00.000Z", rulesApplied: [] },
};

describe("OrderDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders order details with totals and line items", async () => {
    getOrderMock.mockResolvedValue(sampleOrder);

    const wrapper = mount(OrderDetailPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("Order #42");
    expect(wrapper.text()).toContain("CONFIRMED");
    expect(wrapper.text()).toContain("$29.13");
    expect(wrapper.text()).toContain("10:00:00");
    expect(wrapper.text()).toContain("Pricing Trace");
  });

  it("shows Submit Appeal link pointing to order source", async () => {
    getOrderMock.mockResolvedValue(sampleOrder);

    const wrapper = mount(OrderDetailPage, {
      global: {
        stubs: {
          RouterLink: {
            template: '<a :to="to"><slot /></a>',
            props: ["to"],
          },
        },
      },
    });
    await flush();

    expect(wrapper.text()).toContain("Submit Appeal");
    expect(wrapper.html()).toContain("source=order-detail");
    expect(wrapper.html()).toContain("orderId=42");
  });

  it("opens discussion thread via resolve API", async () => {
    getOrderMock.mockResolvedValue(sampleOrder);
    resolveThreadMock.mockResolvedValue({
      discussionId: 55,
      contextType: "ORDER",
      contextId: 42,
    });

    const wrapper = mount(OrderDetailPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    const discussionBtn = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("Open Discussion"));

    expect(discussionBtn).toBeDefined();
    await discussionBtn!.trigger("click");
    await flush();

    expect(resolveThreadMock).toHaveBeenCalledWith({
      contextType: "ORDER",
      contextId: 42,
    });

    expect(pushMock).toHaveBeenCalledWith({
      name: "discussion-thread",
      params: { id: "55" },
    });
  });

  it("shows error when order fetch fails", async () => {
    getOrderMock.mockRejectedValue(new Error("Order not found"));

    const wrapper = mount(OrderDetailPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("Order not found");
  });
});
