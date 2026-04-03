/**
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: pushMock }),
  RouterLink: { template: "<a><slot /></a>" },
}));

const getPendingApplicationsMock = vi.hoisted(() => vi.fn());
const decideApplicationMock = vi.hoisted(() => vi.fn());

vi.mock("../src/api/leaderApi", () => ({
  leaderApi: {
    getPendingApplications: getPendingApplicationsMock,
    decideApplication: decideApplicationMock,
  },
}));

import AdministratorHomePage from "../src/pages/AdministratorHomePage.vue";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const pendingApp = {
  id: 5,
  userId: 12,
  fullName: "Leader Candidate",
  phone: "555-9999",
  experienceSummary: "Has managed a group for two years.",
  governmentIdLast4: "1234",
  certificationName: "Food Handler Certificate",
  certificationIssuer: "State Health Dept",
  yearsOfExperience: 5,
  pickupPointId: 3,
  requestedCommissionEligible: true,
  status: "PENDING" as const,
  submittedAt: "2026-04-01T10:00:00.000Z",
  reviewedAt: null,
  decisionReason: null,
  decisionByAdminId: null,
  decisionByAdminUsername: null,
  decisionCommissionEligible: null,
  decisionAt: null,
};

describe("AdministratorHomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays pending applications with commission eligibility controls", async () => {
    getPendingApplicationsMock.mockResolvedValue({ data: [pendingApp] });

    const wrapper = mount(AdministratorHomePage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("#5");
    expect(wrapper.text()).toContain("12");
    expect(wrapper.text()).toContain("****1234");
    expect(wrapper.text()).toContain("Food Handler Certificate");
    expect(wrapper.text()).toContain("State Health Dept");
    expect(wrapper.text()).toContain("5");
    expect(wrapper.find("select").exists()).toBe(true);
    expect(wrapper.text()).toContain("Approve");
    expect(wrapper.text()).toContain("Reject");
  });

  it("approves application with explicit commission eligibility value", async () => {
    getPendingApplicationsMock
      .mockResolvedValueOnce({ data: [pendingApp] })
      .mockResolvedValueOnce({ data: [] });

    decideApplicationMock.mockResolvedValue({
      id: 1,
      leaderApplicationId: 5,
      decision: "APPROVED",
      reason: "Credentials verified and approved.",
    });

    const wrapper = mount(AdministratorHomePage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    const approveButton = wrapper
      .findAll("button")
      .find((btn) => btn.text() === "Approve");

    expect(approveButton).toBeDefined();
    await approveButton!.trigger("click");
    await flush();

    expect(decideApplicationMock).toHaveBeenCalledWith(5, {
      decision: "APPROVE",
      reason: "Credentials verified and approved.",
      commissionEligible: true,
    });

    expect(wrapper.text()).toContain("approved");
    expect(wrapper.text()).toContain("commission eligibility set to eligible");
  });

  it("rejects application and sends commission eligible false", async () => {
    const appNotEligible = { ...pendingApp, requestedCommissionEligible: false, governmentIdLast4: null, certificationName: null, certificationIssuer: null, yearsOfExperience: null };
    getPendingApplicationsMock
      .mockResolvedValueOnce({ data: [appNotEligible] })
      .mockResolvedValueOnce({ data: [] });

    decideApplicationMock.mockResolvedValue({
      id: 2,
      leaderApplicationId: 5,
      decision: "REJECTED",
      reason: "Application rejected due to incomplete requirements.",
    });

    const wrapper = mount(AdministratorHomePage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    const rejectButton = wrapper
      .findAll("button")
      .find((btn) => btn.text() === "Reject");

    await rejectButton!.trigger("click");
    await flush();

    expect(decideApplicationMock).toHaveBeenCalledWith(5, {
      decision: "REJECT",
      reason: "Application rejected due to incomplete requirements.",
      commissionEligible: false,
    });

    expect(wrapper.text()).toContain("rejected");
  });

  it("shows empty state when no pending applications", async () => {
    getPendingApplicationsMock.mockResolvedValue({ data: [] });

    const wrapper = mount(AdministratorHomePage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("No pending applications");
  });
});
