const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

const statusMessages: Record<number, string> = {
  400: "The request was invalid. Please check your input and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You are not allowed to perform this action.",
  404: "The requested resource was not found.",
  409: "The request conflicts with the current state of the data.",
  422: "Some fields failed validation. Please review and try again.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "The server encountered an internal error. Please try again shortly.",
  502: "The service is temporarily unavailable. Please try again shortly.",
  503: "The service is temporarily unavailable. Please try again shortly.",
  504: "The server took too long to respond. Please try again.",
};

const handledAuthorizationCodes = new Set([
  "ROLE_FORBIDDEN",
  "APPEAL_FORBIDDEN",
  "APPEAL_STATUS_FORBIDDEN",
  "THREAD_FORBIDDEN",
]);

export type ApiAuthFailureContext = {
  status: number;
  path: string;
  code?: string;
  payload: unknown;
};

type ApiAuthFailureHandler = (
  context: ApiAuthFailureContext,
) => void | Promise<void>;

let authFailureHandler: ApiAuthFailureHandler | null = null;

export const registerApiAuthFailureHandler = (
  handler: ApiAuthFailureHandler | null,
): void => {
  authFailureHandler = handler;
};

const sanitizeMessage = (value: string): string =>
  value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tryUnwrapSuccessEnvelope = <T>(payload: unknown): T | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const maybeEnvelope = payload as {
    success?: unknown;
    data?: unknown;
  };

  if (
    "data" in maybeEnvelope &&
    "success" in maybeEnvelope &&
    maybeEnvelope.success !== false
  ) {
    return maybeEnvelope.data as T;
  }

  if (maybeEnvelope.success === true && "data" in maybeEnvelope) {
    return maybeEnvelope.data as T;
  }

  return undefined;
};

const extractDetailMessage = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const typed = payload as {
    error?: unknown;
    message?: unknown;
    details?: unknown;
    success?: unknown;
  };

  if (
    typed.success === false &&
    typed.error &&
    typeof typed.error === "object"
  ) {
    const wrappedError = typed.error as {
      message?: unknown;
      details?: unknown;
    };

    if (
      typeof wrappedError.message === "string" &&
      wrappedError.message.trim().length > 0
    ) {
      return wrappedError.message;
    }

    if (Array.isArray(wrappedError.details)) {
      const firstIssue = wrappedError.details.find(
        (issue) =>
          issue &&
          typeof issue === "object" &&
          "message" in issue &&
          typeof (issue as { message?: unknown }).message === "string",
      ) as { message: string } | undefined;

      if (firstIssue) {
        return firstIssue.message;
      }
    }
  }

  if (typeof typed.error === "string" && typed.error.trim().length > 0) {
    return typed.error;
  }

  if (typeof typed.message === "string" && typed.message.trim().length > 0) {
    return typed.message;
  }

  if (Array.isArray(typed.details)) {
    const firstIssue = typed.details.find(
      (issue) =>
        issue &&
        typeof issue === "object" &&
        "message" in issue &&
        typeof (issue as { message?: unknown }).message === "string",
    ) as { message: string } | undefined;

    if (firstIssue) {
      return firstIssue.message;
    }
  }

  return undefined;
};

const extractErrorCode = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const typed = payload as {
    code?: unknown;
    error?: unknown;
  };

  if (typeof typed.code === "string" && typed.code.trim().length > 0) {
    return typed.code;
  }

  if (typed.error && typeof typed.error === "object") {
    const wrappedError = typed.error as { code?: unknown };
    if (
      typeof wrappedError.code === "string" &&
      wrappedError.code.trim().length > 0
    ) {
      return wrappedError.code;
    }
  }

  return undefined;
};

const shouldHandleAuthFailure = (context: ApiAuthFailureContext): boolean => {
  if (!authFailureHandler) {
    return false;
  }

  if (context.status === 401) {
    return context.path !== "/auth/login";
  }

  if (context.status !== 403) {
    return false;
  }

  return context.code ? handledAuthorizationCodes.has(context.code) : false;
};

const buildErrorMessage = (
  status: number,
  path: string,
  payload: unknown,
): string => {
  const fallback =
    statusMessages[status] ?? `Request failed with status ${status}.`;
  const detail = extractDetailMessage(payload);

  if (!detail) {
    return `${fallback} (endpoint: ${path})`;
  }

  return `${fallback} ${sanitizeMessage(detail)} (endpoint: ${path})`;
};

const parsePayload = async (response: Response): Promise<unknown> => {
  const rawText = await response.text();
  if (rawText.length === 0) {
    return undefined;
  }

  const contentType = (
    response.headers.get("content-type") ?? ""
  ).toLowerCase();
  const looksLikeJson =
    contentType.includes("application/json") || /^[\[{]/.test(rawText.trim());

  if (!looksLikeJson) {
    return rawText;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
};

export class ApiError extends Error {
  public readonly status: number;
  public readonly payload: unknown;
  public readonly code?: string;

  public constructor(
    message: string,
    status: number,
    payload: unknown,
    code?: string,
  ) {
    super(message);
    this.status = status;
    this.payload = payload;
    this.code = code;
  }
}

export const apiRequest = async <T>(
  path: string,
  options?: RequestInit,
): Promise<T> => {
  const mergedHeaders = new Headers(options?.headers ?? {});
  const body = options?.body;
  const shouldSetJsonContentType =
    body !== undefined &&
    body !== null &&
    typeof body === "string" &&
    !mergedHeaders.has("Content-Type");

  if (!mergedHeaders.has("Accept")) {
    mergedHeaders.set(
      "Accept",
      "application/json, text/plain;q=0.9, */*;q=0.8",
    );
  }

  if (shouldSetJsonContentType) {
    mergedHeaders.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      credentials: "include",
      ...options,
      headers: mergedHeaders,
    });
  } catch {
    throw new ApiError(
      `Unable to reach the server. Check your network connection and confirm the API is running. (endpoint: ${path})`,
      0,
      null,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await parsePayload(response);

  if (!response.ok) {
    const code = extractErrorCode(payload);
    const message = buildErrorMessage(response.status, path, payload);
    const error = new ApiError(message, response.status, payload, code);

    if (shouldHandleAuthFailure({ status: response.status, path, code, payload })) {
      void Promise.resolve(
        authFailureHandler?.({ status: response.status, path, code, payload }),
      ).catch(() => undefined);
    }

    throw error;
  }

  const unwrapped = tryUnwrapSuccessEnvelope<T>(payload);
  if (unwrapped !== undefined) {
    return unwrapped;
  }

  return payload as T;
};
