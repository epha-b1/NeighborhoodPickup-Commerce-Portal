<template>
  <section class="page-card" v-if="pickupPoint">
    <div class="split-head">
      <div>
        <h1>{{ pickupPoint.name }}</h1>
        <p class="muted">
          {{ pickupPoint.address.line1 }}, {{ pickupPoint.address.city }},
          {{ pickupPoint.address.stateRegion }} {{ pickupPoint.address.postalCode }}
        </p>
      </div>
      <button @click="togglePickupFavorite">
        {{ pickupPoint.isFavorite ? 'Unfavorite Pickup Point' : 'Favorite Pickup Point' }}
      </button>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <h3>Business Hours</h3>
        <ul>
          <li v-for="entry in businessHourEntries" :key="entry.day">
            <strong>{{ entry.day }}:</strong>
            <span>{{ entry.hours }}</span>
          </li>
        </ul>
      </div>
      <div class="info-card">
        <h3>Capacity</h3>
        <p>Daily Capacity: {{ pickupPoint.dailyCapacity }}</p>
        <p>Remaining Today: {{ pickupPoint.remainingCapacityToday }}</p>
      </div>
    </div>

    <h3>Pickup Windows</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Start</th>
            <th>End</th>
            <th>Total</th>
            <th>Reserved</th>
            <th>Remaining</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="window in pickupPoint.windows" :key="window.windowId">
            <td>{{ window.date }}</td>
            <td>{{ window.startTime }}</td>
            <td>{{ window.endTime }}</td>
            <td>{{ window.capacityTotal }}</td>
            <td>{{ window.reservedSlots }}</td>
            <td>{{ window.remainingCapacity }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section v-else class="page-card">
    <h1>Pickup Point</h1>
    <p v-if="loading" class="muted">Loading pickup point...</p>
    <p v-else class="error-text">{{ error || 'Pickup point not found.' }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { commerceApi } from '../api/commerceApi';
import type { PickupPointDetail } from '../types/commerce';

const route = useRoute();

const loading = ref(false);
const error = ref('');
const pickupPoint = ref<PickupPointDetail | null>(null);

const pickupPointId = computed(() => Number(route.params.id));

const businessHourEntries = computed(() => {
  if (!pickupPoint.value) {
    return [] as Array<{ day: string; hours: string }>;
  }

  return Object.entries(pickupPoint.value.businessHours).map(([day, windows]) => ({
    day,
    hours: windows.length ? windows.join(', ') : 'Closed'
  }));
});

const fetchPickupPoint = async () => {
  loading.value = true;
  error.value = '';
  try {
    pickupPoint.value = await commerceApi.getPickupPoint(pickupPointId.value);
  } catch (err) {
    pickupPoint.value = null;
    error.value = err instanceof Error ? err.message : 'Failed to fetch pickup point.';
  } finally {
    loading.value = false;
  }
};

const togglePickupFavorite = async () => {
  if (!pickupPoint.value) {
    return;
  }

  try {
    await commerceApi.toggleFavorite({
      type: 'PICKUP_POINT',
      targetId: pickupPoint.value.id
    });
    await fetchPickupPoint();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to toggle pickup favorite.';
  }
};

onMounted(fetchPickupPoint);
</script>