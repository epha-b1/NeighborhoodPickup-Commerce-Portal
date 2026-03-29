<template>
  <section class="auth-page forbidden-page">
    <article class="auth-card forbidden-card">
      <p class="auth-eyebrow">Access Restricted</p>
      <h1>You are not authorized for this route.</h1>
      <p class="muted">
        The app blocked access before continuing, and the API also rejected the
        request for your current role.
      </p>

      <div class="status-notice">
        <span v-if="fromPath">Blocked from {{ fromPath }}</span>
        <span v-else>Choose a valid workspace for your role.</span>
      </div>

      <div class="inline-actions">
        <router-link v-if="homePath" class="link-btn" :to="homePath">
          Go to My Workspace
        </router-link>
        <router-link class="ghost-link-btn" to="/notifications">
          Open Notifications
        </router-link>
        <button class="ghost-btn" @click="onLogout">Sign out</button>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { resolveRoleHomePath } from "../constants/roles";
import { useAuthStore } from "../stores/authStore";

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const homePath = computed(() => resolveRoleHomePath(authStore.roles));
const fromPath = computed(() =>
  typeof route.query.from === "string" ? route.query.from : "",
);

const onLogout = async () => {
  await authStore.logout();
  await router.replace("/login");
};
</script>
