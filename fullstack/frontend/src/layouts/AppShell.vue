<template>
  <div class="app-shell">
    <header class="shell-header">
      <div class="brand-block">
        <router-link class="brand-mark" :to="homePath ?? '/login'">
          <span class="brand-kicker">NeighborhoodPickup</span>
          <strong class="brand">Operations Portal</strong>
        </router-link>
        <p class="brand-subtitle">
          Role-aware workspace for pickup operations, finance, and moderation.
        </p>
      </div>

      <div class="header-actions">
        <div class="user-chip">
          <span class="user-chip__name">{{ username }}</span>
          <span class="user-chip__roles">{{ roleSummary }}</span>
        </div>
        <button class="ghost-btn" @click="onLogout">Sign out</button>
      </div>
    </header>

    <div class="shell-body">
      <aside class="shell-sidebar">
        <nav class="shell-nav" aria-label="Primary">
          <router-link
            v-for="item in navItems"
            :key="item.to"
            class="shell-nav__link"
            :to="item.to"
          >
            {{ item.label }}
          </router-link>
        </nav>
      </aside>

      <main class="shell-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import {
  resolveAppNavItems,
  resolveRoleHomePath,
  roleDisplayNames,
} from "../constants/roles";
import { useAuthStore } from "../stores/authStore";

const authStore = useAuthStore();
const router = useRouter();

const username = computed(() => authStore.user?.username ?? "unknown");
const homePath = computed(() => resolveRoleHomePath(authStore.roles));
const navItems = computed(() => resolveAppNavItems(authStore.roles));
const roleSummary = computed(() =>
  authStore.roles.map((role) => roleDisplayNames[role]).join(" / "),
);

const onLogout = async () => {
  await authStore.logout();
  await router.replace("/login");
};
</script>
