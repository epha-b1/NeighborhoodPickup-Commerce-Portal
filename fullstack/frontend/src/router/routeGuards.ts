import { resolveRoleHomePath } from "../constants/roles";
import type { RoleName } from "../types/auth";

type RouteMetaLike = {
  public?: boolean;
  roles?: RoleName[];
};

type RouteLike = {
  path: string;
  fullPath: string;
  meta: RouteMetaLike;
};

type AuthStoreLike = {
  initialized: boolean;
  isAuthenticated: boolean;
  roles: RoleName[];
  initialize: () => Promise<void>;
};

export const isRouteAccessibleForRoles = (params: {
  isPublic: boolean;
  requiredRoles: RoleName[];
  userRoles: RoleName[];
}): boolean => {
  if (params.isPublic) {
    return true;
  }

  if (params.requiredRoles.length === 0) {
    return true;
  }

  return params.requiredRoles.some((role) => params.userRoles.includes(role));
};

export const resolveAuthNavigation = async (params: {
  to: RouteLike;
  authStore: AuthStoreLike;
}) => {
  const { to, authStore } = params;

  if (!authStore.initialized) {
    await authStore.initialize();
  }

  const requiresPublic = Boolean(to.meta.public);
  if (requiresPublic) {
    if (authStore.isAuthenticated && to.path === "/login") {
      const homePath = resolveRoleHomePath(authStore.roles);
      if (homePath) {
        return homePath;
      }
    }
    return true;
  }

  if (!authStore.isAuthenticated) {
    return {
      path: "/login",
      query: {
        redirect: to.fullPath,
      },
    };
  }

  const requiredRoles = to.meta.roles ?? [];
  const allowed = isRouteAccessibleForRoles({
    isPublic: false,
    requiredRoles,
    userRoles: authStore.roles,
  });
  if (!allowed) {
    return {
      path: "/forbidden",
      query: {
        from: to.fullPath,
      },
    };
  }

  return true;
};
