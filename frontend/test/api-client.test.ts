import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  apiRequest,
  registerApiAuthFailureHandler,
} from "../src/api/client";

const mockFetch = vi.fn<typeof fetch>();

vi.stubGlobal("fetch", mockFetch);

const mockJsonResponse = (payload: unknown, status = 200): Response => {
  const body = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "application/json" : null,
    } as Headers,
    text: async () => body,
  } as unknown as Response;
};

afterEach(() => {
  mockFetch.mockReset();
  registerApiAuthFailureHandler(null);
});

describe("ApiError", () => {
  it("captures status, payload, and code", () => {
    const payload = { error: "bad request" };
    const error = new ApiError("Request failed", 400, payload, "BAD_REQUEST");

    expect(error.message).toBe("Request failed");
    expect(error.status).toBe(400);
    expect(error.payload).toEqual(payload);
    expect(error.code).toBe("BAD_REQUEST");
  });
});

describe("apiRequest", () => {
  it("returns plain JSON payloads for legacy endpoints", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ user: { id: 1 } }));

    const payload = await apiRequest<{ user: { id: number } }>("/auth/me");
    expect(payload.user.id).toBe(1);
  });

  it("parses wrapped success responses", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ success: true, data: { ok: true } }),
    );

    const payload = await apiRequest<{ ok: boolean }>("/health");
    expect(payload.ok).toBe(true);
  });

  it("extracts wrapped error messages", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(
        {
          success: false,
          error: { code: "NOT_AUTHENTICATED", message: "Not authenticated." },
        },
        401,
      ),
    );

    await expect(apiRequest("/auth/me")).rejects.toThrow(
      /Your session has expired\./,
    );
  });

  it("calls the auth failure handler for 401 responses outside login", async () => {
    const onAuthFailure = vi.fn();
    registerApiAuthFailureHandler(onAuthFailure);

    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(
        {
          success: false,
          error: { code: "NOT_AUTHENTICATED", message: "Not authenticated." },
        },
        401,
      ),
    );

    await expect(apiRequest("/auth/me")).rejects.toThrow(ApiError);
    expect(onAuthFailure).toHaveBeenCalledWith({
      status: 401,
      path: "/auth/me",
      code: "NOT_AUTHENTICATED",
      payload: {
        success: false,
        error: { code: "NOT_AUTHENTICATED", message: "Not authenticated." },
      },
    });
  });

  it("does not call the auth failure handler for invalid login attempts", async () => {
    const onAuthFailure = vi.fn();
    registerApiAuthFailureHandler(onAuthFailure);

    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid username or password.",
          },
        },
        401,
      ),
    );

    await expect(apiRequest("/auth/login")).rejects.toThrow(ApiError);
    expect(onAuthFailure).not.toHaveBeenCalled();
  });

  it("calls the auth failure handler for role-forbidden API responses", async () => {
    const onAuthFailure = vi.fn();
    registerApiAuthFailureHandler(onAuthFailure);

    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(
        {
          success: false,
          error: {
            code: "ROLE_FORBIDDEN",
            message: "You are not authorized for this route.",
          },
        },
        403,
      ),
    );

    await expect(apiRequest("/admin/withdrawal-blacklist")).rejects.toThrow(
      ApiError,
    );
    expect(onAuthFailure).toHaveBeenCalledWith({
      status: 403,
      path: "/admin/withdrawal-blacklist",
      code: "ROLE_FORBIDDEN",
      payload: {
        success: false,
        error: {
          code: "ROLE_FORBIDDEN",
          message: "You are not authorized for this route.",
        },
      },
    });
  });

  it("returns descriptive network error when fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("socket hang up"));

    await expect(apiRequest("/auth/login")).rejects.toThrow(
      /Unable to reach the server\./,
    );
  });
});
