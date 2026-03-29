import type { RoleName } from "../types/auth";

export const roleHomePaths: Record<RoleName, string> = {
  MEMBER: "/home/member",
  GROUP_LEADER: "/home/group-leader",
  REVIEWER: "/home/reviewer",
  FINANCE_CLERK: "/home/finance-clerk",
  ADMINISTRATOR: "/home/administrator",
};

export const rolePriority: RoleName[] = [
  "ADMINISTRATOR",
  "FINANCE_CLERK",
  "REVIEWER",
  "GROUP_LEADER",
  "MEMBER",
];

export const roleDisplayNames: Record<RoleName, string> = {
  MEMBER: "Member",
  GROUP_LEADER: "Group Leader",
  REVIEWER: "Reviewer",
  FINANCE_CLERK: "Finance Clerk",
  ADMINISTRATOR: "Administrator",
};

export const resolvePrimaryRole = (roles: RoleName[]): RoleName | null =>
  rolePriority.find((role) => roles.includes(role)) ?? roles[0] ?? null;

export const resolveRoleHomePath = (roles: RoleName[]): string | null => {
  const primaryRole = resolvePrimaryRole(roles);
  return primaryRole ? roleHomePaths[primaryRole] : null;
};

export const hasAnyRole = (
  userRoles: RoleName[],
  allowedRoles: RoleName[],
): boolean => allowedRoles.some((role) => userRoles.includes(role));

type AppNavItem = {
  label: string;
  to: string;
  roles: RoleName[];
};

const appNavItems: AppNavItem[] = [
  {
    label: "Admin Home",
    to: "/home/administrator",
    roles: ["ADMINISTRATOR"],
  },
  {
    label: "Finance Home",
    to: "/home/finance-clerk",
    roles: ["FINANCE_CLERK"],
  },
  {
    label: "Reviewer Home",
    to: "/home/reviewer",
    roles: ["REVIEWER"],
  },
  {
    label: "Leader Home",
    to: "/home/group-leader",
    roles: ["GROUP_LEADER"],
  },
  {
    label: "Leader Onboarding",
    to: "/home/group-leader",
    roles: ["MEMBER"],
  },
  {
    label: "Member Home",
    to: "/home/member",
    roles: ["MEMBER"],
  },
  {
    label: "Active Cycles",
    to: "/member/cycles",
    roles: ["MEMBER"],
  },
  {
    label: "Listings",
    to: "/member/listings",
    roles: ["MEMBER"],
  },
  {
    label: "Notifications",
    to: "/notifications",
    roles: [
      "MEMBER",
      "GROUP_LEADER",
      "REVIEWER",
      "FINANCE_CLERK",
      "ADMINISTRATOR",
    ],
  },
  {
    label: "Finance",
    to: "/finance/dashboard",
    roles: ["FINANCE_CLERK", "ADMINISTRATOR"],
  },
  {
    label: "Blacklist",
    to: "/admin/withdrawal-blacklist",
    roles: ["ADMINISTRATOR"],
  },
];

export const resolveAppNavItems = (roles: RoleName[]): AppNavItem[] =>
  appNavItems.filter((item) => hasAnyRole(roles, item.roles));
