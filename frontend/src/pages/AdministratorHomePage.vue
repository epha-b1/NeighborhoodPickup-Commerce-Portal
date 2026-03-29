<template>
  <section class="page-card">
    <h1>Administrator Home</h1>
    <p class="muted">
      Manage leader onboarding decisions, commission eligibility, and risk
      controls.
    </p>

    <h3 style="margin-top: 1rem">Pending Leader Applications</h3>
    <div class="table-wrap" v-if="pending.length > 0">
      <table>
        <thead>
          <tr>
            <th>Application</th>
            <th>User</th>
            <th>Pickup Point</th>
            <th>Requested Commission</th>
            <th>Submitted</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in pending" :key="item.id">
            <td>#{{ item.id }}</td>
            <td>{{ item.userId }}</td>
            <td>{{ item.pickupPointId ?? 'N/A' }}</td>
            <td>{{ item.requestedCommissionEligible ? 'Yes' : 'No' }}</td>
            <td>{{ formatDate(item.submittedAt) }}</td>
            <td>
              <div class="inline-actions">
                <button @click="review(item.id, 'APPROVE')" :disabled="loadingId === item.id">
                  Approve
                </button>
                <button @click="review(item.id, 'REJECT')" :disabled="loadingId === item.id">
                  Reject
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="muted">No pending applications at the moment.</p>

    <div class="inline-actions">
      <router-link class="link-btn" to="/admin/withdrawal-blacklist"
        >Manage Withdrawal Blacklist</router-link
      >
    </div>

    <p v-if="message" class="muted">{{ message }}</p>
    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { leaderApi } from '../api/leaderApi';
import type { LeaderApplicationRecord } from '../types/leaders';

const pending = ref<LeaderApplicationRecord[]>([]);
const loadingId = ref<number | null>(null);
const message = ref('');
const error = ref('');

const formatDate = (value: string) => new Date(value).toLocaleString();

const loadPending = async () => {
  error.value = '';
  try {
    const response = await leaderApi.getPendingApplications();
    pending.value = response.data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load pending applications.';
  }
};

const review = async (applicationId: number, decision: 'APPROVE' | 'REJECT') => {
  loadingId.value = applicationId;
  error.value = '';
  message.value = '';
  try {
    await leaderApi.decideApplication(applicationId, {
      decision,
      reason:
        decision === 'APPROVE'
          ? 'Credentials verified and approved.'
          : 'Application rejected due to incomplete requirements.',
      commissionEligible: decision === 'APPROVE'
    });
    message.value = `Application #${applicationId} ${decision === 'APPROVE' ? 'approved' : 'rejected'}.`;
    await loadPending();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to submit decision.';
  } finally {
    loadingId.value = null;
  }
};

onMounted(loadPending);
</script>
