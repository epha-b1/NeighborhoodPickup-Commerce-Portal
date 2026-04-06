import { dbPool } from "../../src/db/pool";
import {
  transitionCycleStatus,
  isCycleActiveForCheckout,
} from "../../src/features/commerce/repositories/cycleRepository";

vi.mock("../../src/db/pool", () => ({
  dbPool: { query: vi.fn(), getConnection: vi.fn() },
}));

const mockedQuery = vi.mocked(dbPool.query);

describe("buying-cycle lifecycle transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { from: "DRAFT", to: "ACTIVE" },
    { from: "ACTIVE", to: "CLOSED" },
    { from: "CLOSED", to: "FULFILLED" },
    { from: "FULFILLED", to: "ARCHIVED" },
  ] as const)(
    "allows valid transition $from -> $to",
    async ({ from, to }) => {
      // First call: getCycleById SELECT
      mockedQuery.mockResolvedValueOnce([
        [{ id: 1, status: from, ends_at: "2026-04-30T00:00:00Z" }],
      ] as any);
      // Second call: UPDATE
      mockedQuery.mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const result = await transitionCycleStatus({ cycleId: 1, toStatus: to });

      expect(result).toEqual({
        cycleId: 1,
        fromStatus: from,
        toStatus: to,
      });
      expect(mockedQuery).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    { from: "DRAFT", to: "CLOSED" },
    { from: "ACTIVE", to: "FULFILLED" },
    { from: "ARCHIVED", to: "ACTIVE" },
  ] as const)(
    "rejects invalid transition $from -> $to",
    async ({ from, to }) => {
      mockedQuery.mockResolvedValueOnce([
        [{ id: 1, status: from, ends_at: "2026-04-30T00:00:00Z" }],
      ] as any);

      await expect(
        transitionCycleStatus({ cycleId: 1, toStatus: to }),
      ).rejects.toThrow("INVALID_CYCLE_TRANSITION");

      // Only the SELECT should have been called; no UPDATE
      expect(mockedQuery).toHaveBeenCalledTimes(1);
    },
  );

  it("throws CYCLE_NOT_FOUND when cycle does not exist", async () => {
    mockedQuery.mockResolvedValueOnce([[] as any] as any);

    await expect(
      transitionCycleStatus({ cycleId: 999, toStatus: "ACTIVE" }),
    ).rejects.toThrow("CYCLE_NOT_FOUND");

    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });
});

describe("isCycleActiveForCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when cycle is ACTIVE and within date range", async () => {
    mockedQuery.mockResolvedValueOnce([[{ ok: 1 }]] as any);

    const result = await isCycleActiveForCheckout(1);

    expect(result).toBe(true);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it("returns false when no matching row", async () => {
    mockedQuery.mockResolvedValueOnce([[]] as any);

    const result = await isCycleActiveForCheckout(1);

    expect(result).toBe(false);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });
});
