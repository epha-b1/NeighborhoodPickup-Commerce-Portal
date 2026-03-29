import * as repository from '../../src/features/orders/data/orderRepository';
import { dbPool } from '../../src/db/pool';

vi.mock('../../src/db/pool', () => ({
  dbPool: {
    query: vi.fn(),
    getConnection: vi.fn()
  }
}));

const mockedDbPool = vi.mocked(dbPool);

describe('ledger repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped ledger rows with account metadata', async () => {
    mockedDbPool.query.mockResolvedValueOnce([
      [
        {
          id: 1,
          order_id: 77,
          settlement_id: 501,
          account_code: 'RECEIVABLE_INTERNAL',
          account_name: 'Internal Receivables',
          direction: 'DEBIT',
          amount: '12.34',
          memo: 'Internal receivable',
          created_at: '2026-03-26T00:00:00.000Z'
        }
      ]
    ]);

    const rows = await repository.getLedgerRows();

    expect(rows).toEqual([
      {
        id: 1,
        orderId: 77,
        settlementId: 501,
        accountCode: 'RECEIVABLE_INTERNAL',
        accountName: 'Internal Receivables',
        direction: 'DEBIT',
        amount: 12.34,
        memo: 'Internal receivable',
        createdAt: new Date('2026-03-26T00:00:00.000Z').toISOString()
      }
    ]);
  });
});