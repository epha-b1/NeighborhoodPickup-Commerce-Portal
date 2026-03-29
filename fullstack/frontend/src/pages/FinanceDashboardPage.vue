<template>
  <section class="page-card">
    <div class="split-head">
      <div>
        <h1>Finance Dashboard</h1>
        <p class="muted">
          Commission summary, withdrawal controls, and reconciliation export.
        </p>
      </div>
      <router-link class="link-btn" :to="backPath">Back</router-link>
    </div>

    <div class="toolbar-grid">
      <label>
        Date From
        <input type="date" v-model="dateFrom" />
      </label>
      <label>
        Date To
        <input type="date" v-model="dateTo" />
      </label>
      <button @click="loadCommissions" :disabled="loading">
        Refresh Commissions
      </button>
    </div>

    <h3>Commissions</h3>
    <div class="table-wrap" v-if="commissions.length > 0">
      <table>
        <thead>
          <tr>
            <th>Leader User</th>
            <th>Pickup Point</th>
            <th>Pre-tax Total</th>
            <th>Rate</th>
            <th>Commission</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in commissions"
            :key="`${row.leaderUserId}-${row.pickupPointId}`"
          >
            <td>{{ row.leaderUserId }}</td>
            <td>{{ row.pickupPointId }}</td>
            <td>${{ row.preTaxItemTotal.toFixed(2) }}</td>
            <td>{{ (row.commissionRate * 100).toFixed(2) }}%</td>
            <td>${{ row.commissionAmount.toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="muted">
      No commission rows found for selected date range.
    </p>

    <h3>Withdrawal Eligibility</h3>
    <div class="inline-actions">
      <label>
        Leader User ID
        <input type="number" min="1" v-model.number="leaderUserId" />
      </label>
      <button @click="loadEligibility">Check Eligibility</button>
    </div>

    <div v-if="eligibility" class="info-card" style="margin-top: 0.75rem">
      <p>
        <strong>Eligible:</strong> {{ eligibility.eligible ? "Yes" : "No" }}
      </p>
      <p>
        <strong>Blacklisted:</strong>
        {{ eligibility.blacklisted ? "Yes" : "No" }}
      </p>
      <p>
        <strong>Remaining Daily Amount:</strong> ${{
          eligibility.remainingDailyAmount.toFixed(2)
        }}
      </p>
      <p>
        <strong>Remaining Weekly Count:</strong>
        {{ eligibility.remainingWeeklyCount }}
      </p>
      <p v-if="eligibility.reason" class="muted">
        Reason: {{ eligibility.reason }}
      </p>
    </div>

    <h3>Request Withdrawal</h3>
    <div class="inline-actions">
      <label>
        Amount (USD)
        <input
          type="number"
          min="0.01"
          step="0.01"
          v-model.number="withdrawalAmount"
        />
      </label>
      <button @click="submitWithdrawal" :disabled="withdrawing">
        Submit Request
      </button>
    </div>

    <p v-if="withdrawalMessage" class="muted">{{ withdrawalMessage }}</p>

    <h3>Reconciliation Export</h3>
    <div class="inline-actions">
      <button @click="downloadCsv">Generate CSV</button>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { resolveRoleHomePath } from "../constants/roles";
import { financeApi } from "../api/financeApi";
import { useAuthStore } from "../stores/authStore";
import type { CommissionRow, WithdrawalEligibility } from "../types/finance";

const authStore = useAuthStore();
const loading = ref(false);
const withdrawing = ref(false);
const error = ref("");
const withdrawalMessage = ref("");

const dateFrom = ref(
  new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10),
);
const dateTo = ref(new Date().toISOString().slice(0, 10));

const commissions = ref<CommissionRow[]>([]);
const leaderUserId = ref<number | null>(null);
const eligibility = ref<WithdrawalEligibility | null>(null);
const withdrawalAmount = ref<number>(25);
const backPath = computed(
  () => resolveRoleHomePath(authStore.roles) ?? "/login",
);

const loadCommissions = async () => {
  loading.value = true;
  error.value = "";
  try {
    const response = await financeApi.getCommissions({
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
    });
    commissions.value = response.data;
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to load commissions.";
    commissions.value = [];
  } finally {
    loading.value = false;
  }
};

const loadEligibility = async () => {
  if (!leaderUserId.value || leaderUserId.value <= 0) {
    error.value = "Enter a valid leader user ID.";
    return;
  }

  error.value = "";
  try {
    eligibility.value = await financeApi.getWithdrawalEligibility(
      leaderUserId.value,
    );
  } catch (err) {
    eligibility.value = null;
    error.value =
      err instanceof Error ? err.message : "Failed to load eligibility.";
  }
};

const submitWithdrawal = async () => {
  if (!leaderUserId.value || leaderUserId.value <= 0) {
    error.value = "Enter a valid leader user ID.";
    return;
  }

  if (withdrawalAmount.value <= 0) {
    error.value = "Withdrawal amount must be positive.";
    return;
  }

  withdrawing.value = true;
  error.value = "";
  withdrawalMessage.value = "";
  try {
    const created = await financeApi.requestWithdrawal({
      amount: withdrawalAmount.value,
      leaderUserId: leaderUserId.value,
    });
    withdrawalMessage.value = `Withdrawal #${created.id} created as ${created.status}.`;
    await loadEligibility();
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Withdrawal request failed.";
  } finally {
    withdrawing.value = false;
  }
};

const downloadCsv = async () => {
  error.value = "";
  try {
    const csv = await financeApi.getReconciliationCsv({
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `reconciliation-${dateFrom.value}-to-${dateTo.value}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : "Failed to export reconciliation CSV.";
  }
};

onMounted(loadCommissions);
</script>
