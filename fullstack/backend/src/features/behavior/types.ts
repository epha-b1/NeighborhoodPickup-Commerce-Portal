export type BehaviorEventType =
  | 'IMPRESSION'
  | 'CLICK'
  | 'FAVORITE'
  | 'VOTE'
  | 'WATCH_COMPLETION';

export type BehaviorEventInput = {
  idempotencyKey: string;
  eventType: BehaviorEventType;
  resourceType: string;
  resourceId?: string | null;
  clientRecordedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type BehaviorSummaryRow = {
  eventType: BehaviorEventType;
  eventCount: number;
};
