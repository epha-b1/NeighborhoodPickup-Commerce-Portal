<template>
  <section class="page-card">
    <h1>Active Buying Cycles</h1>

    <div class="toolbar-grid">
      <label>
        Sort By
        <select v-model="sortBy">
          <option value="startsAt">Start Date</option>
          <option value="endsAt">End Date</option>
          <option value="name">Name</option>
        </select>
      </label>
      <label>
        Direction
        <select v-model="sortDir">
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </label>
      <label>
        Page Size
        <select v-model.number="pageSize">
          <option :value="5">5</option>
          <option :value="10">10</option>
          <option :value="20">20</option>
        </select>
      </label>
      <button @click="fetchCycles">Apply</button>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>

    <div v-if="loading" class="muted">Loading active cycles...</div>
    <div v-else-if="cycles.length === 0" class="muted">No active cycles available.</div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Start</th>
            <th>End</th>
            <th>Listings</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cycle in cycles" :key="cycle.id">
            <td>
              <strong>{{ cycle.name }}</strong>
              <div class="muted small-text">{{ cycle.description }}</div>
            </td>
            <td>{{ formatDate(cycle.startsAt) }}</td>
            <td>{{ formatDate(cycle.endsAt) }}</td>
            <td>{{ cycle.activeListingCount }}</td>
            <td>
              <button @click="viewListings(cycle.id)">View Listings</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pager-row">
      <button :disabled="page === 1 || loading" @click="prevPage">Previous</button>
      <span>Page {{ page }} of {{ maxPage }}</span>
      <button :disabled="page >= maxPage || loading" @click="nextPage">Next</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { commerceApi } from '../api/commerceApi';
import type { BuyingCycleSummary } from '../types/commerce';

const router = useRouter();

const loading = ref(false);
const error = ref('');
const cycles = ref<BuyingCycleSummary[]>([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const sortBy = ref<'startsAt' | 'endsAt' | 'name'>('startsAt');
const sortDir = ref<'asc' | 'desc'>('asc');

const maxPage = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

const fetchCycles = async () => {
  loading.value = true;
  error.value = '';
  try {
    const response = await commerceApi.getActiveCycles({
      page: page.value,
      pageSize: pageSize.value,
      sortBy: sortBy.value,
      sortDir: sortDir.value
    });
    cycles.value = response.data;
    total.value = response.total;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load cycles.';
    cycles.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

const viewListings = async (cycleId: number) => {
  await router.push({ name: 'listings', query: { cycleId: String(cycleId) } });
};

const prevPage = async () => {
  if (page.value > 1) {
    page.value -= 1;
    await fetchCycles();
  }
};

const nextPage = async () => {
  if (page.value < maxPage.value) {
    page.value += 1;
    await fetchCycles();
  }
};

const formatDate = (value: string) => new Date(value).toLocaleString();

watch(pageSize, async () => {
  page.value = 1;
  await fetchCycles();
});

onMounted(fetchCycles);
</script>