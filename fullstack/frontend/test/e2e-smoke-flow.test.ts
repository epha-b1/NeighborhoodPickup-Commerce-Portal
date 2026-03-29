import { describe, expect, it, vi } from "vitest";

import { resolveAuthNavigation } from "../src/router/routeGuards";
import { resolveRoleHomePath } from "../src/constants/roles";
import type { RoleName } from "../src/types/auth";

const buildAuthStore = (params: {
  initialized?: boolean;
  isAuthenticated: boolean;
  roles: RoleName[];
}) => ({
  initialized: params.initialized ?? true,
  isAuthenticated: params.isAuthenticated,
  roles: params.roles,
  initialize: vi.fn(async () => undefined),
});

describe("E2E smoke flow (route-level)", () => {
  it("covers login redirect, member journey access, and forbidden admin access", async () => {
    const anonymous = buildAuthStore({
      isAuthenticated: false,
      roles: [],
    });

    const loginRedirect = await resolveAuthNavigation({
      to: {
        path: "/member/listings",
        fullPath: "/member/listings",
        meta: { roles: ["MEMBER"] },
      },
      authStore: anonymous,
    });

    expect(loginRedirect).toEqual({
      path: "/login",
      query: {
        redirect: "/member/listings",
      },
    });

    const member = buildAuthStore({
      isAuthenticated: true,
      roles: ["MEMBER"],
    });

    const homePath = resolveRoleHomePath(member.roles);
    expect(homePath).toBe("/home/member");

    const listingsAllowed = await resolveAuthNavigation({
      to: {
        path: "/member/listings",
        fullPath: "/member/listings",
        meta: { roles: ["MEMBER"] },
      },
      authStore: member,
    });

    expect(listingsAllowed).toBe(true);

    const checkoutAllowed = await resolveAuthNavigation({
      to: {
        path: "/member/checkout",
        fullPath: "/member/checkout",
        meta: { roles: ["MEMBER"] },
      },
      authStore: member,
    });

    expect(checkoutAllowed).toBe(true);

    const adminDenied = await resolveAuthNavigation({
      to: {
        path: "/admin/withdrawal-blacklist",
        fullPath: "/admin/withdrawal-blacklist",
        meta: { roles: ["ADMINISTRATOR"] },
      },
      authStore: member,
    });

    expect(adminDenied).toEqual({
      path: "/forbidden",
      query: {
        from: "/admin/withdrawal-blacklist",
      },
    });
  });
});
