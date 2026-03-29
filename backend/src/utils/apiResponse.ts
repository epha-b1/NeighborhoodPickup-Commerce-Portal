import type { Response } from "express";

export type ApiSuccessEnvelope<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export const sendSuccess = <T>(
  response: Response,
  data: T,
  status = 200,
  meta?: Record<string, unknown>,
): Response<ApiSuccessEnvelope<T>> => {
  const payload: ApiSuccessEnvelope<T> = meta
    ? { success: true, data, meta }
    : { success: true, data };

  return response.status(status).json(payload);
};

export const sendError = (
  response: Response,
  status: number,
  message: string,
  code = "REQUEST_FAILED",
  details?: unknown,
): Response<ApiErrorEnvelope> => {
  return response.status(status).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
};
