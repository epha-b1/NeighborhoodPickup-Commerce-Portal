<template>
  <section class="auth-page">
    <article class="auth-card">
      <div class="auth-hero">
        <p class="auth-eyebrow">NeighborhoodPickup Portal</p>
        <h1>Secure access for every role.</h1>
        <p class="muted">
          Sign in to open the right workspace for administration, finance,
          moderation, leadership, or member operations.
        </p>
      </div>

      <div v-if="notice" class="status-notice">
        {{ notice }}
      </div>

      <form class="form-stack auth-form" @submit.prevent="onSubmit">
        <label class="auth-field">
          <span>Username</span>
          <input
            v-model="username"
            class="auth-input"
            autocomplete="username"
            placeholder="Enter your username"
            required
          />
        </label>
        <label class="auth-field">
          <span>Password</span>
          <input
            v-model="password"
            class="auth-input"
            type="password"
            autocomplete="current-password"
            placeholder="Enter your password"
            required
          />
        </label>
        <button class="auth-submit" :disabled="authStore.loading" type="submit">
          {{ authStore.loading ? "Signing in..." : "Sign in" }}
        </button>
      </form>

      <div class="auth-footnote">
        <span>Protected by role-aware routing and secure session cookies.</span>
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/authStore";
import { resolveRoleHomePath } from "../constants/roles";
import type { RoleName } from "../types/auth";
import { isRouteAccessibleForRoles } from "../router/routeGuards";

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const username = ref("");
const password = ref("");
const error = ref("");
const notice = computed(() => {
  if (route.query.reason === "session-expired") {
    return "Your session expired. Sign in again to continue.";
  }

  return "";
});

const onSubmit = async () => {
  error.value = "";
  const result = await authStore.login({
    username: username.value,
    password: password.value,
  });

  if (!result.ok) {
    error.value = result.message;
    return;
  }

  const homePath = resolveRoleHomePath(authStore.roles);
  if (!homePath) {
    error.value = "No role assigned. Contact administrator.";
    return;
  }

  const redirect = (() => {
    const requestedRedirect =
      typeof route.query.redirect === "string" ? route.query.redirect : "";

    if (!requestedRedirect || !requestedRedirect.startsWith("/")) {
      return homePath;
    }

    const resolved = router.resolve(requestedRedirect);
    if (resolved.matched.length === 0 || resolved.path === "/login") {
      return homePath;
    }

    const routeRoles = resolved.meta.roles as RoleName[] | undefined;
    const isAllowed = isRouteAccessibleForRoles({
      isPublic: Boolean(resolved.meta.public),
      requiredRoles: routeRoles ?? [],
      userRoles: authStore.roles,
    });

    return isAllowed ? requestedRedirect : homePath;
  })();

  await router.replace(redirect);
};
</script>
