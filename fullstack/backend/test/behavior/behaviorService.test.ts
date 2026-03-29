import {
  ingestBehaviorEvents,
  processBehaviorQueue
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

  it('ingest stores events in queue and skips duplicate idempotency keys', async () => {
    mockedRepo.insertDedupKey
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
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
    expect(mockedRepo.insertBehaviorQueue).toHaveBeenCalledTimes(1);
    expect(mockedRepo.insertBehaviorHotEvent).not.toHaveBeenCalled();
    expect(mockedAuditService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'BEHAVIOR_EVENTS',
        metadata: { accepted: 1, duplicates: 1 }
      })
    );
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
