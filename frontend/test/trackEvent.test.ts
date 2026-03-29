import { afterEach, describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("../src/api/client", () => ({
  apiRequest,
}));

import { trackEvent } from "../src/telemetry/trackEvent";

describe("trackEvent", () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it("sends the requested event type and metadata", async () => {
    apiRequest.mockResolvedValue(undefined);

    await trackEvent({
      eventType: "VOTE",
      resourceType: "DISCUSSION_COMMENT",
      resourceId: "42",
      payload: { vote: "HELPFUL" },
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/behavior/events",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"eventType":"VOTE"'),
      }),
    );
    expect(apiRequest.mock.calls[0]?.[1]?.body).toContain(
      '"resourceType":"DISCUSSION_COMMENT"',
    );
  });

  it("swallows API failures so telemetry never blocks the UI", async () => {
    apiRequest.mockRejectedValue(new Error("network error"));

    await expect(
      trackEvent({
        eventType: "WATCH_COMPLETION",
        resourceType: "DISCUSSION_THREAD",
        resourceId: "99",
      }),
    ).resolves.toBeUndefined();
  });
});
