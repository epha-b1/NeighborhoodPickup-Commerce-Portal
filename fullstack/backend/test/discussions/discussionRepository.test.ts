import {
  getThreadCommentsPage,
  updateNotificationReadState
} from '../../src/features/discussions/repositories/discussionRepository';
import { dbPool } from '../../src/db/pool';

vi.mock('../../src/db/pool', () => ({
  dbPool: {
    query: vi.fn(),
    getConnection: vi.fn()
  }
}));

const mockedDbPool = vi.mocked(dbPool);

describe('discussion repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries fixed 20-row pagination window', async () => {
    mockedDbPool.query
      .mockResolvedValueOnce([[{ total: 40 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    await getThreadCommentsPage({
      discussionId: 5,
      page: 2,
      sort: 'oldest'
    });

    const listQueryCall = mockedDbPool.query.mock.calls[1];
    expect(String(listQueryCall[0])).toContain('LIMIT ? OFFSET ?');
    expect(listQueryCall[1]).toEqual([5, 20, 20]);
  });

  it('updates notification read state and returns success', async () => {
    mockedDbPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const updated = await updateNotificationReadState({
      userId: 1,
      notificationId: 12,
      readState: 'READ'
    });

    expect(updated).toBe(true);
    expect(mockedDbPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE notifications'),
      ['READ', 'READ', 12, 1]
    );
  });
});