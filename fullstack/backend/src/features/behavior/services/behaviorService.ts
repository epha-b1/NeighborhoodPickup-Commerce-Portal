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
  const inserted = await insertDedupKey({
    idempotencyKey: params.event.idempotencyKey,
    eventType: params.event.eventType,
    userId: params.userId
  });

  if (!inserted) {
    return false;
  }

  await insertBehaviorQueue({
    idempotencyKey: params.event.idempotencyKey,
    payload: {
      userId: params.userId,
      ...params.event
    }
  });

  return true;
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

  if (accepted > 0) {
    // Run queue processing without blocking the ingest request path.
    setImmediate(() => {
      void processBehaviorQueue();
    });
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

  if (!inserted) {
    return;
  }

  setImmediate(() => {
    void processBehaviorQueue();
  });
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
  if (retentionSchedulerHandle || env.behaviorRetentionRunIntervalMinutes <= 0) {
    return;
  }

  const intervalMs = env.behaviorRetentionRunIntervalMinutes * 60 * 1000;
  retentionSchedulerHandle = setInterval(() => {
    void runRetentionJobs(null);
  }, intervalMs);
};
