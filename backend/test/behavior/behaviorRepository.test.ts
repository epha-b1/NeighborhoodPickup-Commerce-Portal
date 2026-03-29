import { dbPool } from "../../src/db/pool";
import {
  archiveExpiredHotEvents,
  purgeOldArchiveEvents,
} from "../../src/features/behavior/repositories/behaviorRepository";

const releaseMock = vi.fn();
const beginTransactionMock = vi.fn();
const commitMock = vi.fn();
const rollbackMock = vi.fn();
const connectionQueryMock = vi.fn();

vi.mock("../../src/db/pool", () => ({
  dbPool: {
    query: vi.fn(),
    getConnection: vi.fn(),
  },
}));

const mockedDbPool = vi.mocked(dbPool);

describe("behavior repository retention windows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDbPool.getConnection.mockResolvedValue({
      beginTransaction: beginTransactionMock,
      query: connectionQueryMock,
      commit: commitMock,
      rollback: rollbackMock,
      release: releaseMock,
    } as any);
  });

  it("archives hot events older than 90 days", async () => {
    connectionQueryMock
      .mockResolvedValueOnce([[{ id: 10 }, { id: 11 }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}]);

    const archivedCount = await archiveExpiredHotEvents();

    expect(archivedCount).toBe(2);
    expect(beginTransactionMock).toHaveBeenCalledTimes(1);
    expect(connectionQueryMock.mock.calls[0][0]).toContain("INTERVAL 90 DAY");
    expect(connectionQueryMock.mock.calls[1][1]).toEqual([10, 11]);
    expect(connectionQueryMock.mock.calls[2][1]).toEqual([10, 11]);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("purges archived events older than 365 days", async () => {
    mockedDbPool.query.mockResolvedValue([{ affectedRows: 3 }] as any);

    const purgedCount = await purgeOldArchiveEvents();

    expect(purgedCount).toBe(3);
    expect(mockedDbPool.query).toHaveBeenCalledWith(
      expect.stringContaining("INTERVAL 365 DAY"),
    );
  });
});
