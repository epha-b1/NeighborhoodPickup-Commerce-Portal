/**
 * @vitest-environment jsdom
 */

import { setActivePinia, createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: pushMock }),
  RouterLink: { template: "<a><slot /></a>" },
}));

const getMyApplicationMock = vi.hoisted(() => vi.fn());
const createApplicationMock = vi.hoisted(() => vi.fn());
const getDashboardMetricsMock = vi.hoisted(() => vi.fn());
const getWithdrawalEligibilityMock = vi.hoisted(() => vi.fn());
const requestWithdrawalMock = vi.hoisted(() => vi.fn());

vi.mock("../src/api/leaderApi", () => ({
  leaderApi: {
    getMyApplication: getMyApplicationMock,
    createApplication: createApplicationMock,
    getDashboardMetrics: getDashboardMetricsMock,
  },
}));

vi.mock("../src/api/financeApi", () => ({
  financeApi: {
    getWithdrawalEligibility: getWithdrawalEligibilityMock,
    requestWithdrawal: requestWithdrawalMock,
  },
}));

import GroupLeaderHomePage from "../src/pages/GroupLeaderHomePage.vue";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("GroupLeaderHomePage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("shows onboarding form and validates minimum fields", async () => {
    getMyApplicationMock.mockResolvedValue({ data: null });
    getDashboardMetricsMock.mockRejectedValue(new Error("not found"));

    const wrapper = mount(GroupLeaderHomePage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("Leader Onboarding Application");

    await wrapper.find("form").trigger("submit.prevent");
    await flush();

    expect(wrapper.text()).toContain("Full name must be at least 3 characters");
    expect(createApplicationMock).not.toHaveBeenCalled();
  });

  it("submits application and shows success message", async () => {
    getMyApplicationMock.mockResolvedValue({ data: null });
    getDashboardMetricsMock.mockRejectedValue(new Error("not found"));
    createApplicationMock.mockResolvedValue({
      id: 1,
      userId: 10,
      status: "PENDING",
      submittedAt: "2026-04-01T00:00:00.000Z",
      decisionReason: null,
      decisionCommissionEligible: null,
    });

    const wrapper = mount(GroupLeaderHomePage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    await wrapper.find('input[maxlength="120"]').setValue("Jane Leader");
    await wrapper.find('input[maxlength="32"]').setValue("555-1234");
    await wrapper.find("textarea").setValue("I have managed a community pickup group for three years with great results.");

    await wrapper.find("form").trigger("submit.prevent");
    await flush();

    expect(createApplicationMock).toHaveBeenCalledTimes(1);
    expect(createApplicationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "Jane Leader",
        phone: "555-1234",
      }),
    );
    expect(wrapper.text()).toContain("Application submitted successfully");
  });

  it("displays application status and dashboard metrics when approved", async () => {
    getMyApplicationMock.mockResolvedValue({
      data: {
        id: 1,
        userId: 10,
        status: "APPROVED",
        submittedAt: "2026-03-28T00:00:00.000Z",
        decisionReason: "Credentials verified",
        decisionCommissionEligible: true,
      },
    });
    getDashboardMetricsMock.mockResolvedValue({
      leaderId: 1,
      windowStartDate: "2026-03-01",
      windowEndDate: "2026-03-30",
      orderVolume: 42,
      fulfillmentRate: 95.5,
      feedbackTrend: { direction: "UP", latest7DayAverage: 4.5, previous7DayAverage: 4.1 },
      daily: [],
    });
    getWithdrawalEligibilityMock.mockResolvedValue({
      leaderUserId: 10,
      blacklisted: false,
      remainingDailyAmount: 500,
      remainingWeeklyCount: 2,
      eligible: true,
      reason: null,
    });

    const wrapper = mount(GroupLeaderHomePage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("APPROVED");
    expect(wrapper.text()).toContain("Eligible");
    expect(wrapper.text()).toContain("42");
    expect(wrapper.text()).toContain("95.50%");
    expect(wrapper.text()).toContain("UP");
    expect(wrapper.text()).toContain("Withdrawal Controls");
  });

  it("shows pending status when application is awaiting review", async () => {
    getMyApplicationMock.mockResolvedValue({
      data: {
        id: 1,
        userId: 10,
        status: "PENDING",
        submittedAt: "2026-03-28T00:00:00.000Z",
        decisionReason: null,
        decisionCommissionEligible: null,
      },
    });
    getDashboardMetricsMock.mockRejectedValue(new Error("not found"));

    const wrapper = mount(GroupLeaderHomePage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("PENDING");
    expect(wrapper.text()).toContain("Pending decision");
  });

  it("shows rejected status with decision reason", async () => {
    getMyApplicationMock.mockResolvedValue({
      data: {
        id: 1,
        userId: 10,
        status: "REJECTED",
        submittedAt: "2026-03-28T00:00:00.000Z",
        decisionReason: "Incomplete documentation",
        decisionCommissionEligible: false,
      },
    });
    getDashboardMetricsMock.mockRejectedValue(new Error("not found"));

    const wrapper = mount(GroupLeaderHomePage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("REJECTED");
    expect(wrapper.text()).toContain("Incomplete documentation");
  });

  it("validates experience summary minimum length", async () => {
    getMyApplicationMock.mockResolvedValue({ data: null });
    getDashboardMetricsMock.mockRejectedValue(new Error("not found"));

    const wrapper = mount(GroupLeaderHomePage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    await wrapper.find('input[maxlength="120"]').setValue("Jane Leader");
    await wrapper.find('input[maxlength="32"]').setValue("555-1234");
    await wrapper.find("textarea").setValue("Short");

    await wrapper.find("form").trigger("submit.prevent");
    await flush();

    expect(createApplicationMock).not.toHaveBeenCalled();
  });

  it("shows withdrawal controls with eligibility status", async () => {
    getMyApplicationMock.mockResolvedValue({
      data: {
        id: 1,
        userId: 10,
        status: "APPROVED",
        submittedAt: "2026-03-28T00:00:00.000Z",
        decisionReason: "Approved",
        decisionCommissionEligible: true,
      },
    });
    getDashboardMetricsMock.mockResolvedValue({
      leaderId: 1,
      windowStartDate: "2026-03-01",
      windowEndDate: "2026-03-30",
      orderVolume: 10,
      fulfillmentRate: 100,
      feedbackTrend: { direction: "STABLE", latest7DayAverage: 4.0, previous7DayAverage: 4.0 },
      daily: [],
    });
    getWithdrawalEligibilityMock.mockResolvedValue({
      leaderUserId: 10,
      blacklisted: true,
      remainingDailyAmount: 0,
      remainingWeeklyCount: 0,
      eligible: false,
      reason: "Leader is blacklisted for withdrawals.",
    });

    const wrapper = mount(GroupLeaderHomePage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("Withdrawal Controls");
    expect(wrapper.text()).toContain("Refresh Eligibility");
  });
});
