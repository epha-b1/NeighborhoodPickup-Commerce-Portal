import { apiRequest } from "./client";
import type { AuthUser } from "../types/auth";

type MeResponse = {
  user: AuthUser;
  expiresAt: string;
};

type LoginResponse = MeResponse;

type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

const unwrap = <T>(payload: T | SuccessEnvelope<T>): T => {
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    (payload as { success?: unknown }).success === true &&
    "data" in payload
  ) {
    return (payload as SuccessEnvelope<T>).data;
  }

  return payload as T;
};

export const authApi = {
  login: async (payload: { username: string; password: string }) =>
    unwrap(
      await apiRequest<LoginResponse | SuccessEnvelope<LoginResponse>>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
    ),
  me: async () =>
    unwrap(
      await apiRequest<MeResponse | SuccessEnvelope<MeResponse>>("/auth/me"),
    ),
  logout: () => apiRequest<void>("/auth/logout", { method: "POST" }),
};
