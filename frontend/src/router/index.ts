import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import AppShell from "../layouts/AppShell.vue";
import LoginPage from "../pages/LoginPage.vue";
import MemberHomePage from "../pages/MemberHomePage.vue";
import GroupLeaderHomePage from "../pages/GroupLeaderHomePage.vue";
import ReviewerHomePage from "../pages/ReviewerHomePage.vue";
import FinanceClerkHomePage from "../pages/FinanceClerkHomePage.vue";
import AdministratorHomePage from "../pages/AdministratorHomePage.vue";
import ForbiddenPage from "../pages/ForbiddenPage.vue";
import ActiveCyclesPage from "../pages/ActiveCyclesPage.vue";
import ListingsPage from "../pages/ListingsPage.vue";
import PickupPointDetailPage from "../pages/PickupPointDetailPage.vue";
import CheckoutPage from "../pages/CheckoutPage.vue";
import OrderDetailPage from "../pages/OrderDetailPage.vue";
import DiscussionThreadPage from "../pages/discussion/DiscussionThreadPage.vue";
import NotificationCenterPage from "../pages/NotificationCenterPage.vue";
import AppealDraftPage from "../pages/AppealDraftPage.vue";
import AppealStatusPage from "../pages/AppealStatusPage.vue";
import FinanceDashboardPage from "../pages/FinanceDashboardPage.vue";
import AdminWithdrawalBlacklistPage from "../pages/AdminWithdrawalBlacklistPage.vue";
import { useAuthStore } from "../stores/authStore";
import type { RoleName } from "../types/auth";
import { resolveAuthNavigation } from "./routeGuards";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: LoginPage,
    meta: { public: true },
  },
  {
    path: "/",
    component: AppShell,
    children: [
      {
        path: "home/member",
        component: MemberHomePage,
        meta: { roles: ["MEMBER"] },
      },
      {
        path: "member/cycles",
        name: "member-cycles",
        component: ActiveCyclesPage,
        meta: { roles: ["MEMBER"] },
      },
      {
        path: "member/listings",
        name: "listings",
        component: ListingsPage,
        meta: { roles: ["MEMBER"] },
      },
      {
        path: "member/pickup-points/:id",
        name: "pickup-point-detail",
        component: PickupPointDetailPage,
        meta: { roles: ["MEMBER"] },
      },
      {
        path: "member/checkout",
        name: "checkout",
        component: CheckoutPage,
        meta: { roles: ["MEMBER"] },
      },
      {
        path: "member/orders/:id",
        name: "order-detail",
        component: OrderDetailPage,
        meta: { roles: ["MEMBER", "FINANCE_CLERK", "ADMINISTRATOR"] },
      },
      {
        path: "threads/:id",
        name: "discussion-thread",
        component: DiscussionThreadPage,
        meta: {
          roles: [
            "MEMBER",
            "GROUP_LEADER",
            "REVIEWER",
            "FINANCE_CLERK",
            "ADMINISTRATOR",
          ],
        },
      },
      {
        path: "notifications",
        name: "notifications",
        component: NotificationCenterPage,
        meta: {
          roles: [
            "MEMBER",
            "GROUP_LEADER",
            "REVIEWER",
            "FINANCE_CLERK",
            "ADMINISTRATOR",
          ],
        },
      },
      {
        path: "appeals/new",
        name: "appeal-draft",
        component: AppealDraftPage,
        meta: {
          roles: [
            "MEMBER",
            "GROUP_LEADER",
            "REVIEWER",
            "FINANCE_CLERK",
            "ADMINISTRATOR",
          ],
        },
      },
      {
        path: "appeals/:id",
        name: "appeal-status",
        component: AppealStatusPage,
        meta: {
          roles: [
            "MEMBER",
            "GROUP_LEADER",
            "REVIEWER",
            "FINANCE_CLERK",
            "ADMINISTRATOR",
          ],
        },
      },
      {
        path: "home/group-leader",
        component: GroupLeaderHomePage,
        meta: { roles: ["GROUP_LEADER", "MEMBER"] },
      },
      {
        path: "home/reviewer",
        component: ReviewerHomePage,
        meta: { roles: ["REVIEWER"] },
      },
      {
        path: "home/finance-clerk",
        component: FinanceClerkHomePage,
        meta: { roles: ["FINANCE_CLERK"] },
      },
      {
        path: "finance/dashboard",
        name: "finance-dashboard",
        component: FinanceDashboardPage,
        meta: { roles: ["FINANCE_CLERK", "ADMINISTRATOR"] },
      },
      {
        path: "home/administrator",
        component: AdministratorHomePage,
        meta: { roles: ["ADMINISTRATOR"] },
      },
      {
        path: "admin/withdrawal-blacklist",
        name: "admin-withdrawal-blacklist",
        component: AdminWithdrawalBlacklistPage,
        meta: { roles: ["ADMINISTRATOR"] },
      },
    ],
  },
  {
    path: "/forbidden",
    component: ForbiddenPage,
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  return resolveAuthNavigation({
    to: {
      path: to.path,
      fullPath: to.fullPath,
      meta: {
        public: Boolean(to.meta.public),
        roles: (to.meta.roles as RoleName[] | undefined) ?? [],
      },
    },
    authStore,
  });
});
