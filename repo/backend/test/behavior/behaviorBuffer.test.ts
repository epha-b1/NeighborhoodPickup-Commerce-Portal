import {
  _getBufferForTesting,
  ingestBehaviorEvents,
} from "../../src/features/behavior/services/behaviorService";
import * as repo from "../../src/features/behavior/repositories/behaviorRepository";

vi.mock("../../src/features/behavior/repositories/behaviorRepository");
vi.mock("../../src/features/audit/services/auditService", () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockedRepo = vi.mocked(repo);

describe("behavior in-memory buffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Drain the buffer between tests so state does not leak.
    const buf = _getBufferForTesting();
    buf.items.splice(0, buf.items.length);
    buf.dedupSet.clear();
    mockedRepo.listPendingBehaviorQueueItems.mockResolvedValue([]);
  });

  it("events are buffered in memory and not immediately written to DB queue", async () => {
    await ingestBehaviorEvents({
      userId: 7,
      events: [
        {
          idempotencyKey: "buf-key-001",
          eventType: "CLICK",
          resourceType: "LISTING",
          resourceId: "9",
          clientRecordedAt: null,
          metadata: null,
        },
      ],
    });

    const buf = _getBufferForTesting();
    expect(buf.items.length).toBeGreaterThan(0);
    expect(mockedRepo.insertBehaviorQueue).not.toHaveBeenCalled();
    expect(mockedRepo.insertDedupKey).not.toHaveBeenCalled();
  });

  it("deduplicates events with the same idempotency key in the buffer", async () => {
    const result = await ingestBehaviorEvents({
      userId: 7,
      events: [
        {
          idempotencyKey: "buf-dup-001",
          eventType: "CLICK",
          resourceType: "LISTING",
          resourceId: "9",
          clientRecordedAt: null,
          metadata: null,
        },
        {
          idempotencyKey: "buf-dup-001",
          eventType: "CLICK",
          resourceType: "LISTING",
          resourceId: "9",
          clientRecordedAt: null,
          metadata: null,
        },
      ],
    });

    expect(result.accepted).toBe(1);
    expect(result.duplicates).toBe(1);

    const buf = _getBufferForTesting();
    // Only one event should be in the buffer
    expect(buf.items.length).toBe(1);
  });

  it("flush writes buffered events to DB queue", async () => {
    mockedRepo.insertDedupKey.mockResolvedValue(true);
    mockedRepo.insertBehaviorQueue.mockResolvedValue();

    await ingestBehaviorEvents({
      userId: 7,
      events: [
        {
          idempotencyKey: "buf-flush-001",
          eventType: "IMPRESSION",
          resourceType: "LISTING",
          resourceId: "44",
          clientRecordedAt: null,
          metadata: null,
        },
      ],
    });

    // Confirm buffer has the event
    const buf = _getBufferForTesting();
    expect(buf.items.length).toBeGreaterThan(0);

    // Flush the buffer
    await buf.flush();

    expect(mockedRepo.insertDedupKey).toHaveBeenCalled();
    expect(mockedRepo.insertBehaviorQueue).toHaveBeenCalled();
  });

  it("triggers prompt micro-flush after successful ingest via setImmediate", async () => {
    mockedRepo.insertDedupKey.mockResolvedValue(true);
    mockedRepo.insertBehaviorQueue.mockResolvedValue();

    await ingestBehaviorEvents({
      userId: 7,
      events: [
        {
          idempotencyKey: "buf-prompt-001",
          eventType: "CLICK",
          resourceType: "LISTING",
          resourceId: "9",
          clientRecordedAt: null,
          metadata: null,
        },
      ],
    });

    // Buffer has the event right after ingest returns
    const buf = _getBufferForTesting();
    expect(buf.items.length).toBe(1);

    // Wait for the setImmediate micro-flush to execute
    await new Promise((resolve) => setImmediate(resolve));
    // Give the async flush a tick to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // After micro-flush, buffer should be drained and DB writes should have occurred
    expect(buf.items.length).toBe(0);
    expect(mockedRepo.insertDedupKey).toHaveBeenCalled();
    expect(mockedRepo.insertBehaviorQueue).toHaveBeenCalled();
  });

  it("after flush the buffer is empty", async () => {
    mockedRepo.insertDedupKey.mockResolvedValue(true);
    mockedRepo.insertBehaviorQueue.mockResolvedValue();

    await ingestBehaviorEvents({
      userId: 7,
      events: [
        {
          idempotencyKey: "buf-empty-001",
          eventType: "VOTE",
          resourceType: "LISTING",
          resourceId: "10",
          clientRecordedAt: null,
          metadata: null,
        },
      ],
    });

    const buf = _getBufferForTesting();
    await buf.flush();

    expect(buf.items.length).toBe(0);
    expect(buf.dedupSet.size).toBe(0);
  });
});
