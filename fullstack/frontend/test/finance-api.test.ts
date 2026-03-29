import { afterEach, describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("../src/api/client", () => ({
  apiRequest,
}));

import { financeApi } from "../src/api/financeApi";

describe("financeApi", () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it("requests leader self-service eligibility without an override query", async () => {
    apiRequest.mockResolvedValue({
      leaderUserId: 1,
      blacklisted: false,
      remainingDailyAmount: 500,
      remainingWeeklyCount: 2,
      eligible: true,
      reason: null,
    });

    await financeApi.getWithdrawalEligibility();

    expect(apiRequest).toHaveBeenCalledWith("/finance/withdrawals/eligibility");
  });

  it("posts self-service withdrawal payload without a leader override", async () => {
    apiRequest.mockResolvedValue({
      id: 5,
      leaderUserId: 1,
      requestedAmount: 25,
      status: "APPROVED",
      requestedAt: new Date().toISOString(),
      decidedAt: new Date().toISOString(),
      decidedByUserId: 1,
      decisionNote: "ok",
    });

    await financeApi.requestWithdrawal({ amount: 25 });

    expect(apiRequest).toHaveBeenCalledWith(
      "/finance/withdrawals",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ amount: 25 }),
      }),
    );
  });
});
