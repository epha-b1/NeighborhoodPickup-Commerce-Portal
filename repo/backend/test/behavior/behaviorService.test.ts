import {
  _getBufferForTesting,
  getRetentionStatus,
  ingestBehaviorEvents,
  processBehaviorQueue,
  runRetentionJobs,
} from '../../src/features/behavior/services/behaviorService';
import * as repo from '../../src/features/behavior/repositories/behaviorRepository';
import * as auditService from '../../src/features/audit/services/auditService';

vi.mock('../../src/features/behavior/repositories/behaviorRepository');
vi.mock('../../src/features/audit/services/auditService', () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined)
}));

const mockedRepo = vi.mocked(repo);
const mockedAuditService = vi.mocked(auditService);

describe('behavior service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRepo.listPendingBehaviorQueueItems.mockResolvedValue([]);
  });

  it('ingest buffers events in memory and skips duplicate idempotency keys', async () => {
    const buffer = _getBufferForTesting();
    buffer.items.length = 0;
    buffer.dedupSet.clear();

    mockedRepo.insertDedupKey.mockResolvedValue(true);
    mockedRepo.insertBehaviorQueue.mockResolvedValue();

    const result = await ingestBehaviorEvents({
      userId: 7,
      events: [
        {
          idempotencyKey: 'idem-key-1111',
          eventType: 'CLICK',
          resourceType: 'LISTING',
          resourceId: '9',
          metadata: null
        },
        {
          idempotencyKey: 'idem-key-1111',
          eventType: 'CLICK',
          resourceType: 'LISTING',
          resourceId: '9',
          metadata: null
        }
      ]
    });

    expect(result).toEqual({ accepted: 1, duplicates: 1 });
    // Events are buffered in memory, not yet written to DB queue
    expect(buffer.items.length).toBe(1);
    expect(mockedRepo.insertBehaviorQueue).not.toHaveBeenCalled();
    expect(mockedRepo.insertBehaviorHotEvent).not.toHaveBeenCalled();
    expect(mockedAuditService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'BEHAVIOR_EVENTS',
        metadata: { accepted: 1, duplicates: 1 }
      })
    );

    // Flush writes to DB
    await buffer.flush();
    expect(mockedRepo.insertDedupKey).toHaveBeenCalled();
    expect(mockedRepo.insertBehaviorQueue).toHaveBeenCalled();

    buffer.items.length = 0;
    buffer.dedupSet.clear();
  });

  it('processes pending queue items into hot storage', async () => {
    mockedRepo.listPendingBehaviorQueueItems
      .mockResolvedValueOnce([
        {
          id: 1,
          retryCount: 0,
          payloadJson: JSON.stringify({
            userId: 3,
            idempotencyKey: 'idem-key-1234',
            eventType: 'IMPRESSION',
            resourceType: 'LISTING',
            resourceId: '44',
            metadata: { source: 'feed' }
          })
        }
      ])
      .mockResolvedValueOnce([]);
    mockedRepo.insertBehaviorHotEvent.mockResolvedValue();
    mockedRepo.markBehaviorQueueProcessed.mockResolvedValue();

    await processBehaviorQueue();

    expect(mockedRepo.insertBehaviorHotEvent).toHaveBeenCalledWith({
      userId: 3,
      event: expect.objectContaining({
        idempotencyKey: 'idem-key-1234',
        eventType: 'IMPRESSION'
      })
    });
    expect(mockedRepo.markBehaviorQueueProcessed).toHaveBeenCalledWith(1);
    expect(mockedRepo.markBehaviorQueueFailed).not.toHaveBeenCalled();
  });

  it('marks invalid queue payload as failed with retry metadata', async () => {
    mockedRepo.listPendingBehaviorQueueItems
      .mockResolvedValueOnce([
        {
          id: 2,
          retryCount: 1,
          payloadJson: JSON.stringify({ userId: 5, resourceType: 'LISTING' })
        }
      ])
      .mockResolvedValueOnce([]);
    mockedRepo.markBehaviorQueueFailed.mockResolvedValue();

    await processBehaviorQueue();

    expect(mockedRepo.markBehaviorQueueFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        queueId: 2,
        retryCount: 1,
        maxRetries: 5
      })
    );
    expect(mockedRepo.markBehaviorQueueProcessed).not.toHaveBeenCalled();
  });
});

describe('behavior retention lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRepo.listPendingBehaviorQueueItems.mockResolvedValue([]);
  });

  it('runRetentionJobs archives hot events and purges old archives', async () => {
    mockedRepo.archiveExpiredHotEvents.mockResolvedValue(15);
    mockedRepo.purgeOldArchiveEvents.mockResolvedValue(3);

    const result = await runRetentionJobs(1);

    expect(result.archivedCount).toBe(15);
    expect(result.purgedCount).toBe(3);
    expect(mockedRepo.archiveExpiredHotEvents).toHaveBeenCalledTimes(1);
    expect(mockedRepo.purgeOldArchiveEvents).toHaveBeenCalledTimes(1);
    expect(mockedAuditService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ROLLBACK',
        resourceType: 'BEHAVIOR_RETENTION',
        metadata: { archivedCount: 15, purgedCount: 3 }
      })
    );
  });

  it('runRetentionJobs handles zero events gracefully', async () => {
    mockedRepo.archiveExpiredHotEvents.mockResolvedValue(0);
    mockedRepo.purgeOldArchiveEvents.mockResolvedValue(0);

    const result = await runRetentionJobs(null);

    expect(result.archivedCount).toBe(0);
    expect(result.purgedCount).toBe(0);
    expect(mockedAuditService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: null,
        metadata: { archivedCount: 0, purgedCount: 0 }
      })
    );
  });

  it('getRetentionStatus returns counts from repository', async () => {
    mockedRepo.getRetentionStatusCounts.mockResolvedValue({
      hotCount: 500,
      archiveCount: 1200,
      queuePending: 3,
    });

    const status = await getRetentionStatus();

    expect(status.hotCount).toBe(500);
    expect(status.archiveCount).toBe(1200);
    expect(status.queuePending).toBe(3);
    expect(mockedRepo.getRetentionStatusCounts).toHaveBeenCalledTimes(1);
  });
});
