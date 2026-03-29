<template>
  <section class="page-card">
    <h1>Reviewer Home</h1>
    <p class="muted">
      Moderation queue for appeals with structured status progression.
    </p>

    <div class="toolbar-grid" style="margin-top: 0.75rem">
      <label>
        Status Filter
        <select v-model="statusFilter" @change="loadQueue">
          <option value="">All</option>
          <option value="INTAKE">INTAKE</option>
          <option value="INVESTIGATION">INVESTIGATION</option>
          <option value="RULING">RULING</option>
        </select>
      </label>
      <button @click="loadQueue" :disabled="loading">Refresh Queue</button>
    </div>

    <div class="table-wrap" v-if="appeals.length > 0">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Source</th>
            <th>Reason</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="appeal in appeals" :key="appeal.id">
            <td>#{{ appeal.id }}</td>
            <td>{{ appeal.status }}</td>
            <td>{{ appeal.sourceType }}</td>
            <td>{{ appeal.reasonCategory }}</td>
            <td>{{ formatDate(appeal.createdAt) }}</td>
            <td>
              <div class="inline-actions">
                <router-link class="link-btn" :to="`/appeals/${appeal.id}`">Open</router-link>
                <button
                  v-if="appeal.status === 'INTAKE'"
                  @click="transition(appeal.id, 'INVESTIGATION')"
                  :disabled="transitioningId === appeal.id"
                >
                  Move to Investigation
                </button>
                <button
                  v-if="appeal.status === 'INVESTIGATION'"
                  @click="transition(appeal.id, 'RULING')"
                  :disabled="transitioningId === appeal.id"
                >
                  Move to Ruling
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-else class="muted">No appeals matched the selected filter.</p>
    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { appealApi } from '../api/appealApi';
import type { AppealListItem } from '../types/appeals';

const loading = ref(false);
const error = ref('');
const statusFilter = ref<'' | 'INTAKE' | 'INVESTIGATION' | 'RULING'>('');
const appeals = ref<AppealListItem[]>([]);
const transitioningId = ref<number | null>(null);

const formatDate = (value: string) => new Date(value).toLocaleString();

const loadQueue = async () => {
  loading.value = true;
  error.value = '';
  try {
    const response = await appealApi.listAppeals({
      page: 1,
      pageSize: 25,
      status: statusFilter.value || undefined
    });
    appeals.value = response.data;
  } catch (err) {
    appeals.value = [];
    error.value = err instanceof Error ? err.message : 'Failed to load reviewer queue.';
  } finally {
    loading.value = false;
  }
};

const transition = async (appealId: number, toStatus: 'INVESTIGATION' | 'RULING') => {
  transitioningId.value = appealId;
  error.value = '';
  try {
    await appealApi.transitionStatus(
      appealId,
      toStatus,
      toStatus === 'INVESTIGATION'
        ? 'Reviewer accepted appeal for investigation.'
        : 'Reviewer completed investigation and issued ruling.'
    );
    await loadQueue();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Status transition failed.';
  } finally {
    transitioningId.value = null;
  }
};

onMounted(loadQueue);
</script>