import { describe, expect, it, vi } from "vitest";

import {
  isRouteAccessibleForRoles,
  resolveAuthNavigation,
} from "../src/router/routeGuards";
import type { RoleName } from "../src/types/auth";

const createAuthStore = (params: {
  initialized: boolean;
  isAuthenticated: boolean;
  roles: RoleName[];
}) => {
  const initialize = vi.fn(async () => undefined);

  return {
    initialized: params.initialized,
    isAuthenticated: params.isAuthenticated,
    roles: params.roles,
    initialize,
  };
};

describe("route auth guards", () => {
  it("allows public routes regardless of user roles", () => {
    const result = isRouteAccessibleForRoles({
      isPublic: true,
      requiredRoles: ["ADMINISTRATOR"],
      userRoles: ["MEMBER"],
    });

    expect(result).toBe(true);
  });

  it("blocks access when required roles do not overlap", () => {
    const result = isRouteAccessibleForRoles({
      isPublic: false,
      requiredRoles: ["FINANCE_CLERK"],
      userRoles: ["MEMBER"],
    });

    expect(result).toBe(false);
  });

  it("allows access when at least one required role is present", () => {
    const result = isRouteAccessibleForRoles({
      isPublic: false,
      requiredRoles: ["FINANCE_CLERK", "ADMINISTRATOR"],
      userRoles: ["FINANCE_CLERK"],
    });

    expect(result).toBe(true);
  });

  it("redirects unauthenticated users to login with a redirect target", async () => {
    const authStore = createAuthStore({
      initialized: true,
      isAuthenticated: false,
      roles: [],
    });

    const result = await resolveAuthNavigation({
      to: {
        path: "/finance/dashboard",
        fullPath: "/finance/dashboard",
        meta: { roles: ["FINANCE_CLERK"] },
      },
      authStore,
    });

    expect(result).toEqual({
      path: "/login",
      query: {
        redirect: "/finance/dashboard",
      },
    });
  });

  it("redirects authenticated users without required role to forbidden", async () => {
    const authStore = createAuthStore({
      initialized: true,
      isAuthenticated: true,
      roles: ["MEMBER"],
    });

    const result = await resolveAuthNavigation({
      to: {
        path: "/admin/withdrawal-blacklist",
        fullPath: "/admin/withdrawal-blacklist",
        meta: { roles: ["ADMINISTRATOR"] },
      },
      authStore,
    });

    expect(result).toEqual({
      path: "/forbidden",
      query: {
        from: "/admin/withdrawal-blacklist",
      },
    });
  });

  it("allows navigation when authenticated role requirements are met", async () => {
    const authStore = createAuthStore({
      initialized: true,
      isAuthenticated: true,
      roles: ["MEMBER"],
    });

    const result = await resolveAuthNavigation({
      to: {
        path: "/member/cycles",
        fullPath: "/member/cycles",
        meta: { roles: ["MEMBER"] },
      },
      authStore,
    });

    expect(result).toBe(true);
  });

  it("redirects authenticated users away from login to their role home", async () => {
    const authStore = createAuthStore({
      initialized: true,
      isAuthenticated: true,
      roles: ["MEMBER"],
    });

    const result = await resolveAuthNavigation({
      to: {
        path: "/login",
        fullPath: "/login",
        meta: { public: true },
      },
      authStore,
    });

    expect(result).toBe("/home/member");
  });

  it("initializes auth store on first guarded navigation", async () => {
    const authStore = createAuthStore({
      initialized: false,
      isAuthenticated: false,
      roles: [],
    });

    await resolveAuthNavigation({
      to: {
        path: "/member/cycles",
        fullPath: "/member/cycles",
        meta: { roles: ["MEMBER"] },
      },
      authStore,
    });

    expect(authStore.initialize).toHaveBeenCalledTimes(1);
  });
});
