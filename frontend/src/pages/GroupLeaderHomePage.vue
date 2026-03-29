<template>
  <section class="page-card">
    <h1>Group Leader Home</h1>

    <div class="split-head">
      <p class="muted">
        Submit your onboarding application and monitor leader performance
        metrics from live backend data.
      </p>
      <button @click="loadAll" :disabled="loading">Refresh</button>
    </div>

    <div class="info-grid" style="margin-top: 0.75rem" v-if="application">
      <article class="info-card">
        <h3>Application Status</h3>
        <p><strong>{{ application.status }}</strong></p>
        <p class="small-text muted">
          Submitted {{ formatDate(application.submittedAt) }}
        </p>
      </article>
      <article class="info-card">
        <h3>Commission Eligibility</h3>
        <p>
          <strong>{{ commissionEligibilityLabel }}</strong>
        </p>
      </article>
      <article class="info-card">
        <h3>Decision Reason</h3>
        <p>{{ application.decisionReason || 'Awaiting admin review.' }}</p>
      </article>
    </div>

    <form class="form-stack" @submit.prevent="submitApplication">
      <h3>Leader Onboarding Application</h3>
      <label>
        Full Name
        <input v-model="form.fullName" maxlength="120" />
      </label>
      <label>
        Phone
        <input v-model="form.phone" maxlength="32" />
      </label>
      <label>
        Preferred Pickup Point ID (optional)
        <input v-model.number="form.pickupPointId" type="number" min="1" />
      </label>
      <label>
        Experience Summary
        <textarea v-model="form.experienceSummary" rows="5" />
      </label>
      <label>
        <input type="checkbox" v-model="form.requestedCommissionEligible" />
        Request commission eligibility review
      </label>
      <div class="inline-actions">
        <button type="submit" :disabled="submitting">Submit Application</button>
      </div>
    </form>

    <section class="page-card" style="margin-top: 1rem" v-if="metrics">
      <h3>Performance Dashboard</h3>
      <div class="info-grid">
        <article class="info-card">
          <p class="small-text muted">Order Volume (window)</p>
          <p><strong>{{ metrics.orderVolume }}</strong></p>
        </article>
        <article class="info-card">
          <p class="small-text muted">Fulfillment Rate</p>
          <p><strong>{{ metrics.fulfillmentRate.toFixed(2) }}%</strong></p>
        </article>
        <article class="info-card">
          <p class="small-text muted">Feedback Trend</p>
          <p><strong>{{ metrics.feedbackTrend.direction }}</strong></p>
        </article>
      </div>

      <div class="table-wrap" v-if="metrics.daily.length > 0">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Order Volume</th>
              <th>Fulfillment Rate</th>
              <th>Feedback Avg</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in metrics.daily" :key="row.metricDate">
              <td>{{ row.metricDate }}</td>
              <td>{{ row.orderVolume }}</td>
              <td>{{ row.fulfillmentRate.toFixed(2) }}%</td>
              <td>{{ row.feedbackScoreAvg ?? 'N/A' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="muted">No metrics available yet for the selected window.</p>
    </section>

    <section
      class="page-card"
      style="margin-top: 1rem"
      v-if="application?.status === 'APPROVED'"
    >
      <h3>Withdrawal Controls</h3>
      <div class="inline-actions">
        <button @click="loadWithdrawalEligibility" :disabled="withdrawalLoading">
          Refresh Eligibility
        </button>
      </div>

      <div v-if="withdrawalEligibility" class="info-grid">
        <article class="info-card">
          <p class="small-text muted">Remaining Daily Amount</p>
          <p>
            <strong>${{ withdrawalEligibility.remainingDailyAmount.toFixed(2) }}</strong>
          </p>
        </article>
        <article class="info-card">
          <p class="small-text muted">Remaining Weekly Count</p>
          <p><strong>{{ withdrawalEligibility.remainingWeeklyCount }}</strong></p>
        </article>
        <article class="info-card">
          <p class="small-text muted">Eligibility</p>
          <p>
            <strong>{{ withdrawalEligibility.eligible ? "Eligible" : "Not Eligible" }}</strong>
          </p>
          <p v-if="withdrawalEligibility.reason" class="small-text muted">
            {{ withdrawalEligibility.reason }}
          </p>
        </article>
      </div>

      <div class="inline-actions">
        <label>
          Withdrawal Amount (USD)
          <input
            v-model.number="withdrawalAmount"
            type="number"
            min="0.01"
            step="0.01"
          />
        </label>
        <button
          @click="submitWithdrawal"
          :disabled="withdrawing || !withdrawalEligibility?.eligible"
        >
          {{ withdrawing ? "Submitting..." : "Request Withdrawal" }}
        </button>
      </div>

      <p v-if="withdrawalMessage" class="muted">{{ withdrawalMessage }}</p>
    </section>

    <p v-if="message" class="muted">{{ message }}</p>
    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { financeApi } from '../api/financeApi';
import { leaderApi } from '../api/leaderApi';
import type { LeaderApplicationRecord, LeaderDashboardMetrics } from '../types/leaders';
import type { WithdrawalEligibility } from '../types/finance';

const loading = ref(false);
const submitting = ref(false);
const error = ref('');
const message = ref('');
const application = ref<LeaderApplicationRecord | null>(null);
const metrics = ref<LeaderDashboardMetrics | null>(null);
const withdrawalEligibility = ref<WithdrawalEligibility | null>(null);
const withdrawalAmount = ref(25);
const withdrawalLoading = ref(false);
const withdrawing = ref(false);
const withdrawalMessage = ref('');

const commissionEligibilityLabel = computed(() => {
  if (!application.value || application.value.decisionCommissionEligible === null) {
    return 'Pending decision';
  }
  return application.value.decisionCommissionEligible ? 'Eligible' : 'Not eligible';
});

const form = reactive({
  fullName: '',
  phone: '',
  experienceSummary: '',
  pickupPointId: undefined as number | undefined,
  requestedCommissionEligible: true
});

const formatDate = (value: string) => new Date(value).toLocaleString();

const loadAll = async () => {
  loading.value = true;
  error.value = '';
  try {
    const [applicationResponse, dashboard] = await Promise.all([
      leaderApi.getMyApplication(),
      leaderApi.getDashboardMetrics().catch(() => null)
    ]);

    application.value = applicationResponse.data;
    metrics.value = dashboard;
    if (application.value?.status === 'APPROVED') {
      await loadWithdrawalEligibility();
    } else {
      withdrawalEligibility.value = null;
      withdrawalMessage.value = '';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load leader dashboard.';
  } finally {
    loading.value = false;
  }
};

const loadWithdrawalEligibility = async () => {
  withdrawalLoading.value = true;
  error.value = '';
  try {
    withdrawalEligibility.value = await financeApi.getWithdrawalEligibility();
  } catch (err) {
    withdrawalEligibility.value = null;
    error.value =
      err instanceof Error ? err.message : 'Failed to load withdrawal eligibility.';
  } finally {
    withdrawalLoading.value = false;
  }
};

const submitWithdrawal = async () => {
  if (withdrawalAmount.value <= 0) {
    error.value = 'Withdrawal amount must be positive.';
    return;
  }

  withdrawing.value = true;
  error.value = '';
  withdrawalMessage.value = '';
  try {
    const created = await financeApi.requestWithdrawal({ amount: withdrawalAmount.value });
    withdrawalMessage.value = `Withdrawal #${created.id} created as ${created.status}.`;
    await loadWithdrawalEligibility();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to request withdrawal.';
  } finally {
    withdrawing.value = false;
  }
};

const submitApplication = async () => {
  error.value = '';
  message.value = '';

  if (form.fullName.trim().length < 3) {
    error.value = 'Full name must be at least 3 characters.';
    return;
  }

  if (form.experienceSummary.trim().length < 20) {
    error.value = 'Experience summary must be at least 20 characters.';
    return;
  }

  submitting.value = true;
  try {
    const created = await leaderApi.createApplication({
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      experienceSummary: form.experienceSummary.trim(),
      pickupPointId: form.pickupPointId,
      requestedCommissionEligible: form.requestedCommissionEligible
    });

    application.value = created;
    message.value = 'Application submitted successfully.';
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to submit application.';
  } finally {
    submitting.value = false;
  }
};

onMounted(loadAll);
</script>
