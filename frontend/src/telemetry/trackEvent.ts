import { apiRequest } from "../api/client";

type BehaviorEventType =
  | "IMPRESSION"
  | "CLICK"
  | "FAVORITE"
  | "VOTE"
  | "WATCH_COMPLETION";

export type TrackEventInput = {
  eventType: BehaviorEventType;
  resourceType: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
};

type BehaviorIngestRequest = {
  events: Array<{
    idempotencyKey: string;
    eventType: BehaviorEventType;
    resourceType: string;
    resourceId?: string;
    clientRecordedAt: string;
    metadata?: Record<string, unknown>;
  }>;
};

const makeIdempotencyKey = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

export const trackEvent = async (event: TrackEventInput): Promise<void> => {
  const requestBody: BehaviorIngestRequest = {
    events: [
      {
        idempotencyKey: makeIdempotencyKey(),
        eventType: event.eventType,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        clientRecordedAt: new Date().toISOString(),
        metadata: event.payload,
      },
    ],
  };

  try {
    await apiRequest("/behavior/events", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
  } catch {
    // Telemetry should never block user flows.
  }
};
