import { defineStore } from "pinia";
import { authApi } from "../api/authApi";
import { ApiError } from "../api/client";
import type { AuthUser } from "../types/auth";
import { resetUserScopedStores } from "./sessionReset";

type AuthState = {
  user: AuthUser | null;
  initialized: boolean;
  loading: boolean;
};

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    user: null,
    initialized: false,
    loading: false,
  }),
  getters: {
    isAuthenticated: (state) => state.user !== null,
    roles: (state) => state.user?.roles ?? [],
  },
  actions: {
    clearSession() {
      this.user = null;
      resetUserScopedStores();
      this.initialized = true;
    },
    async initialize() {
      if (this.initialized) {
        return;
      }
      this.loading = true;
      try {
        const response = await authApi.me();
        this.user = response.user;
      } catch (_error) {
        this.clearSession();
      } finally {
        this.initialized = true;
        this.loading = false;
      }
    },
    async login(payload: { username: string; password: string }) {
      this.loading = true;
      try {
        const response = await authApi.login(payload);
        this.user = response.user;
        this.initialized = true;
        return { ok: true as const };
      } catch (error) {
        const apiError = error as ApiError;
        return {
          ok: false as const,
          message: apiError.message,
          status: apiError.status,
          code: apiError.code,
          payload: apiError.payload,
        };
      } finally {
        this.loading = false;
      }
    },
    async logout() {
      try {
        await authApi.logout();
      } finally {
        this.clearSession();
      }
    },
  },
});
