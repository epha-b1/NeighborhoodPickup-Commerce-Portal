import crypto from "crypto";
import {
  archiveExpiredHotEvents,
  getBehaviorSummaryRows,
  getRetentionStatusCounts,
  insertBehaviorHotEvent,
  insertBehaviorQueue,
  insertDedupKey,
  listPendingBehaviorQueueItems,
  markBehaviorQueueFailed,
  markBehaviorQueueProcessed,
  purgeOldArchiveEvents
} from '../repositories/behaviorRepository';
import type { BehaviorEventInput } from '../types';
import { recordAuditLog } from '../../audit/services/auditService';
import { env } from '../../../config/env';

const QUEUE_BATCH_SIZE = 50;
const MAX_QUEUE_RETRIES = 5;

let queueProcessorRunning = false;
let retentionSchedulerHandle: NodeJS.Timeout | null = null;
let bufferFlushHandle: NodeJS.Timeout | null = null;

// ---------------------------------------------------------------------------
// In-memory event buffer with durable MySQL fallback
// Events are first held in memory and flushed to the DB queue when:
//   1. Buffer size reaches BEHAVIOR_BUFFER_CAPACITY (default 100)
//   2. A periodic flush timer fires (BEHAVIOR_BUFFER_FLUSH_INTERVAL_MS, default 5 s)
//   3. An in-memory insertion fails (immediate durable fallback for that event)
// Deduplication is still enforced at the DB layer via idempotency keys.
// ---------------------------------------------------------------------------
type BufferedEvent = { userId: number | null; event: BehaviorEventInput };

const inMemoryBuffer: BufferedEvent[] = [];
const inMemoryDedupSet = new Set<string>();

const bufferDedupKey = (userId: number | null, event: BehaviorEventInput): string =>
  `${userId ?? 'null'}:${event.eventType}:${event.idempotencyKey}`;

export const _getBufferForTesting = () => ({
  items: inMemoryBuffer,
  dedupSet: inMemoryDedupSet,
  flush: flushBuffer,
});

const flushBuffer = async (): Promise<void> => {
  if (inMemoryBuffer.length === 0) return;
  const batch = inMemoryBuffer.splice(0, inMemoryBuffer.length);
  inMemoryDedupSet.clear();

  for (const item of batch) {
    try {
      const inserted = await insertDedupKey({
        idempotencyKey: item.event.idempotencyKey,
        eventType: item.event.eventType,
        userId: item.userId,
      });

      if (inserted) {
        await insertBehaviorQueue({
          idempotencyKey: item.event.idempotencyKey,
          payload: { userId: item.userId, ...item.event },
        });
      }
    } catch {
      // Best-effort: item will be lost only if both in-memory AND DB write fail.
      // Idempotency key ensures safe retry on next ingest.
    }
  }

  setImmediate(() => { void processBehaviorQueue(); });
};

export const startBufferFlush = (): void => {
  if (bufferFlushHandle) return;
  const intervalMs = env.behaviorBufferFlushIntervalMs;
  if (intervalMs <= 0) return;
  bufferFlushHandle = setInterval(() => { void flushBuffer(); }, intervalMs);
};

export const stopBufferFlush = (): void => {
  if (bufferFlushHandle) {
    clearInterval(bufferFlushHandle);
    bufferFlushHandle = null;
  }
};

const parseQueuedPayload = (value: unknown): { userId: number | null; event: BehaviorEventInput } => {
  const raw = typeof value === 'string' ? JSON.parse(value) : value;

  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid behavior queue payload.');
  }

  const payload = raw as {
    userId?: number | null;
    idempotencyKey?: string;
    eventType?: BehaviorEventInput['eventType'];
    resourceType?: string;
    resourceId?: string | null;
    clientRecordedAt?: string | null;
    metadata?: Record<string, unknown> | null;
  };

  if (!payload.idempotencyKey || !payload.eventType || !payload.resourceType) {
    throw new Error('Behavior queue payload missing required fields.');
  }

  return {
    userId: payload.userId ?? null,
    event: {
      idempotencyKey: payload.idempotencyKey,
      eventType: payload.eventType,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId ?? null,
      clientRecordedAt: payload.clientRecordedAt ?? null,
      metadata: payload.metadata ?? null
    }
  };
};

export const processBehaviorQueue = async (): Promise<void> => {
  if (queueProcessorRunning) {
    return;
  }

  queueProcessorRunning = true;
  try {
    while (true) {
      const queuedItems = await listPendingBehaviorQueueItems(QUEUE_BATCH_SIZE);
      if (queuedItems.length === 0) {
        break;
      }

      for (const item of queuedItems) {
        try {
          const parsed = parseQueuedPayload(item.payloadJson);
          await insertBehaviorHotEvent({
            userId: parsed.userId,
            event: parsed.event
          });
          await markBehaviorQueueProcessed(item.id);
        } catch (error) {
          await markBehaviorQueueFailed({
            queueId: item.id,
            retryCount: item.retryCount,
            errorMessage: error instanceof Error ? error.message : 'Queue processing error',
            maxRetries: MAX_QUEUE_RETRIES
          });
        }
      }
    }
  } finally {
    queueProcessorRunning = false;
  }
};

const enqueueBehaviorEvent = async (params: {
  userId: number | null;
  event: BehaviorEventInput;
}): Promise<boolean> => {
  const key = bufferDedupKey(params.userId, params.event);

  // Fast-path: check in-memory dedup before touching DB.
  if (inMemoryDedupSet.has(key)) {
    return false;
  }

  // Attempt to buffer in memory first.
  try {
    inMemoryDedupSet.add(key);
    inMemoryBuffer.push({ userId: params.userId, event: params.event });

    // Flush when capacity is reached.
    if (inMemoryBuffer.length >= env.behaviorBufferCapacity) {
      setImmediate(() => { void flushBuffer(); });
    }

    return true;
  } catch {
    // Fallback: write directly to durable DB queue.
    const inserted = await insertDedupKey({
      idempotencyKey: params.event.idempotencyKey,
      eventType: params.event.eventType,
      userId: params.userId,
    });

    if (!inserted) {
      return false;
    }

    await insertBehaviorQueue({
      idempotencyKey: params.event.idempotencyKey,
      payload: { userId: params.userId, ...params.event },
    });

    return true;
  }
};

export const ingestBehaviorEvents = async (params: {
  userId: number | null;
  events: BehaviorEventInput[];
}) => {
  let accepted = 0;
  let duplicates = 0;

  for (const event of params.events) {
    const inserted = await enqueueBehaviorEvent({
      userId: params.userId,
      event
    });
    if (!inserted) {
      duplicates += 1;
      continue;
    }

    accepted += 1;
  }

  if (accepted > 0) {
    await recordAuditLog({
      actorUserId: params.userId,
      action: 'UPLOAD',
      resourceType: 'BEHAVIOR_EVENTS',
      resourceId: null,
      metadata: { accepted, duplicates }
    });
  }

  // Trigger a non-blocking micro-flush so accepted events become durable
  // promptly after the ingest response is sent, without blocking the
  // request path.  The timer/capacity flush remains as a safety net.
  if (accepted > 0) {
    setImmediate(() => { void flushBuffer(); });
  }

  return {
    accepted,
    duplicates
  };
};

export const recordServerBehaviorEvent = async (params: {
  userId: number | null;
  eventType: BehaviorEventInput["eventType"];
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> => {
  const inserted = await enqueueBehaviorEvent({
    userId: params.userId,
    event: {
      idempotencyKey: `server-${crypto.randomUUID()}`,
      eventType: params.eventType,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      clientRecordedAt: null,
      metadata: {
        ...(params.metadata ?? {}),
        source: "server"
      }
    }
  });

  // Event is now in the in-memory buffer; flush will handle DB persistence.
};

export const getBehaviorSummary = async (params: { from?: string; to?: string }) =>
  getBehaviorSummaryRows(params);

export const getRetentionStatus = async () => getRetentionStatusCounts();

export const runRetentionJobs = async (actorUserId: number | null) => {
  const archivedCount = await archiveExpiredHotEvents();
  const purgedCount = await purgeOldArchiveEvents();

  await recordAuditLog({
    actorUserId,
    action: 'ROLLBACK',
    resourceType: 'BEHAVIOR_RETENTION',
    resourceId: null,
    metadata: { archivedCount, purgedCount }
  });

  return {
    archivedCount,
    purgedCount
  };
};

export const startBehaviorBackgroundJobs = (): void => {
  startBufferFlush();

  if (retentionSchedulerHandle || env.behaviorRetentionRunIntervalMinutes <= 0) {
    return;
  }

  const intervalMs = env.behaviorRetentionRunIntervalMinutes * 60 * 1000;
  retentionSchedulerHandle = setInterval(() => {
    void runRetentionJobs(null);
  }, intervalMs);
};
