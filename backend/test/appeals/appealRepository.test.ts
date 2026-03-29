import { listAppeals } from "../../src/features/appeals/repositories/appealRepository";
import { dbPool } from "../../src/db/pool";

vi.mock("../../src/db/pool", () => ({
  dbPool: {
    query: vi.fn(),
  },
}));

const mockedDbPool = vi.mocked(dbPool);

describe("appeal repository list visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies owner filter for finance clerk role", async () => {
    mockedDbPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await listAppeals({
      requesterUserId: 22,
      requesterRoles: ["FINANCE_CLERK"],
      page: 1,
      pageSize: 20,
    });

    const countSql = String(mockedDbPool.query.mock.calls[0][0]);
    const countParams = mockedDbPool.query.mock.calls[0][1] as Array<
      number | string
    >;
    const listSql = String(mockedDbPool.query.mock.calls[1][0]);
    const listParams = mockedDbPool.query.mock.calls[1][1] as Array<
      number | string
    >;

    expect(countSql).toContain("a.submitted_by_user_id = ?");
    expect(listSql).toContain("a.submitted_by_user_id = ?");
    expect(countParams).toEqual([22]);
    expect(listParams).toEqual([22, 20, 0]);
  });

  it("does not apply owner filter for reviewer role", async () => {
    mockedDbPool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await listAppeals({
      requesterUserId: 22,
      requesterRoles: ["REVIEWER"],
      page: 1,
      pageSize: 20,
    });

    const countSql = String(mockedDbPool.query.mock.calls[0][0]);
    const listSql = String(mockedDbPool.query.mock.calls[1][0]);

    expect(countSql).not.toContain("a.submitted_by_user_id = ?");
    expect(listSql).not.toContain("a.submitted_by_user_id = ?");
  });
});
