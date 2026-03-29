<template>
  <section class="page-card">
    <div class="split-head">
      <div>
        <h1>Notification Center</h1>
        <p class="muted">Mentions and replies only.</p>
      </div>
      <button @click="loadNotifications">Refresh</button>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>

    <div v-if="loading" class="muted">Loading notifications...</div>
    <div v-else-if="notifications.length === 0" class="muted">No notifications.</div>

    <div v-else class="notification-list">
      <article v-for="item in notifications" :key="item.id" class="info-card">
        <div class="split-head">
          <div>
            <p><strong>{{ item.notificationType }}</strong></p>
            <p>{{ item.message }}</p>
            <p class="small-text muted">{{ formatDate(item.createdAt) }}</p>
          </div>
          <div class="inline-actions">
            <button @click="toggleReadState(item)">
              Mark {{ item.readState === 'READ' ? 'Unread' : 'Read' }}
            </button>
            <router-link
              class="link-btn"
              :to="{ name: 'discussion-thread', params: { id: String(item.discussionId) } }"
            >
              Open Thread
            </router-link>
          </div>
        </div>
      </article>
    </div>

    <div class="pager-row">
      <button :disabled="page === 1 || loading" @click="prevPage">Previous</button>
      <span>Page {{ page }} of {{ maxPage }}</span>
      <button :disabled="page >= maxPage || loading" @click="nextPage">Next</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { discussionApi } from '../api/discussionApi';
import type { NotificationItem } from '../types/discussion';

const loading = ref(false);
const error = ref('');
const page = ref(1);
const total = ref(0);
const notifications = ref<NotificationItem[]>([]);

const maxPage = computed(() => Math.max(1, Math.ceil(total.value / 20)));

const loadNotifications = async () => {
  loading.value = true;
  error.value = '';
  try {
    const response = await discussionApi.getNotifications(page.value);
    notifications.value = response.data;
    total.value = response.total;
  } catch (err) {
    notifications.value = [];
    total.value = 0;
    error.value = err instanceof Error ? err.message : 'Failed to load notifications.';
  } finally {
    loading.value = false;
  }
};

const toggleReadState = async (item: NotificationItem) => {
  try {
    const nextState = item.readState === 'READ' ? 'UNREAD' : 'READ';
    await discussionApi.setNotificationReadState(item.id, nextState);
    item.readState = nextState;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to update notification state.';
  }
};

const prevPage = async () => {
  if (page.value > 1) {
    page.value -= 1;
    await loadNotifications();
  }
};

const nextPage = async () => {
  if (page.value < maxPage.value) {
    page.value += 1;
    await loadNotifications();
  }
};

const formatDate = (value: string) => new Date(value).toLocaleString();

onMounted(loadNotifications);
</script>