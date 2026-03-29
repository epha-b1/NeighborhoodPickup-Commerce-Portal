<template>
  <section class="page-card">
    <h1>Member Home</h1>
    <p class="muted">
      Live overview of active buying cycles, unread notifications, and your
      recent appeals.
    </p>

    <div class="info-grid" style="margin-top: 0.75rem">
      <article class="info-card">
        <h3>Active Cycles</h3>
        <p class="small-text muted">Currently open for ordering</p>
        <p><strong>{{ activeCycleCount }}</strong></p>
      </article>
      <article class="info-card">
        <h3>Unread Notifications</h3>
        <p class="small-text muted">Mentions and replies awaiting review</p>
        <p><strong>{{ unreadNotificationCount }}</strong></p>
      </article>
      <article class="info-card">
        <h3>Open Appeals</h3>
        <p class="small-text muted">Appeals in intake/investigation</p>
        <p><strong>{{ openAppealCount }}</strong></p>
      </article>
    </div>

    <div class="inline-actions">
      <router-link class="link-btn" to="/member/cycles"
        >Browse Active Buying Cycles</router-link
      >
      <router-link class="link-btn" to="/notifications"
        >Notification Center</router-link
      >
      <router-link class="link-btn" to="/appeals/new"
        >Start New Appeal</router-link
      >
    </div>

    <h3 style="margin-top: 1rem">Latest Appeals</h3>
    <div class="notification-list" v-if="recentAppeals.length > 0">
      <article class="info-card" v-for="item in recentAppeals" :key="item.id">
        <div class="split-head">
          <strong>Appeal #{{ item.id }}</strong>
          <span class="small-text">{{ item.status }}</span>
        </div>
        <p class="small-text muted">
          {{ item.sourceType }} | {{ formatDate(item.createdAt) }}
        </p>
        <p>{{ item.narrative.slice(0, 140) }}{{ item.narrative.length > 140 ? '...' : '' }}</p>
        <div class="inline-actions">
          <router-link class="link-btn" :to="`/appeals/${item.id}`">Track Status</router-link>
          <router-link
            v-if="item.sourceOrderId"
            class="link-btn"
            :to="`/member/orders/${item.sourceOrderId}`"
            >Open Order</router-link
          >
        </div>
      </article>
    </div>
    <p v-else class="muted">No appeals submitted yet.</p>

    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { appealApi } from '../api/appealApi';
import { commerceApi } from '../api/commerceApi';
import { discussionApi } from '../api/discussionApi';
import type { AppealListItem } from '../types/appeals';

const activeCycleCount = ref(0);
const unreadNotificationCount = ref(0);
const recentAppeals = ref<AppealListItem[]>([]);
const error = ref('');

const openAppealCount = computed(
  () =>
    recentAppeals.value.filter(
      (item) => item.status === 'INTAKE' || item.status === 'INVESTIGATION'
    ).length
);

const formatDate = (value: string) => new Date(value).toLocaleString();

const loadDashboard = async () => {
  error.value = '';
  try {
    const [cycles, notifications, appeals] = await Promise.all([
      commerceApi.getActiveCycles({ page: 1, pageSize: 5, sortBy: 'startsAt', sortDir: 'asc' }),
      discussionApi.getNotifications(1),
      appealApi.listAppeals({ page: 1, pageSize: 5 })
    ]);

    activeCycleCount.value = cycles.total;
    unreadNotificationCount.value = notifications.data.filter((item) => item.readState === 'UNREAD').length;
    recentAppeals.value = appeals.data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load member dashboard.';
  }
};

onMounted(loadDashboard);
</script>