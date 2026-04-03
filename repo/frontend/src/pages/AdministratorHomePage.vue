<template>
  <section class="page-card">
    <h1>Administrator Home</h1>
    <p class="muted">
      Review leader credentials, set commission eligibility, and manage risk
      controls.
    </p>

    <h3 style="margin-top: 1rem">Pending Leader Applications</h3>
    <div v-if="pending.length > 0">
      <article
        v-for="item in pending"
        :key="item.id"
        class="info-card"
        style="margin-bottom: 1rem"
      >
        <div class="split-head">
          <h3>Application #{{ item.id }} &mdash; User {{ item.userId }}</h3>
          <span class="small-text muted">{{ formatDate(item.submittedAt) }}</span>
        </div>

        <div class="info-grid" style="margin-top: 0.5rem">
          <div>
            <p><strong>Full Name:</strong> {{ item.fullName }}</p>
            <p><strong>Phone:</strong> {{ item.phone }}</p>
            <p><strong>Pickup Point:</strong> {{ item.pickupPointId ?? "N/A" }}</p>
            <p>
              <strong>Requested Commission:</strong>
              {{ item.requestedCommissionEligible ? "Yes" : "No" }}
            </p>
          </div>
          <div>
            <p>
              <strong>Gov ID (last 4):</strong>
              {{ item.governmentIdLast4 ? `****${item.governmentIdLast4}` : "Not provided" }}
            </p>
            <p>
              <strong>Certification:</strong>
              {{ item.certificationName || "Not provided" }}
            </p>
            <p>
              <strong>Issuer:</strong>
              {{ item.certificationIssuer || "Not provided" }}
            </p>
            <p>
              <strong>Years of Experience:</strong>
              {{ item.yearsOfExperience ?? "Not provided" }}
            </p>
          </div>
        </div>

        <p style="margin-top: 0.5rem">
          <strong>Experience Summary:</strong>
        </p>
        <p class="comment-body">{{ item.experienceSummary }}</p>

        <div class="inline-actions" style="margin-top: 0.75rem">
          <label>
            Commission Eligibility
            <select
              v-model="commissionEligibleById[item.id]"
              :disabled="loadingId === item.id"
            >
              <option :value="true">Eligible</option>
              <option :value="false">Not Eligible</option>
            </select>
          </label>
          <button
            @click="review(item.id, 'APPROVE')"
            :disabled="loadingId === item.id"
          >
            Approve
          </button>
          <button
            @click="review(item.id, 'REJECT')"
            :disabled="loadingId === item.id"
          >
            Reject
          </button>
        </div>
      </article>
    </div>
    <p v-else class="muted">No pending applications at the moment.</p>

    <div class="inline-actions">
      <router-link class="link-btn" to="/admin/withdrawal-blacklist"
        >Manage Withdrawal Blacklist</router-link
      >
      <router-link class="link-btn" to="/admin/audit-logs"
        >Audit Logs</router-link
      >
    </div>

    <p v-if="message" class="muted">{{ message }}</p>
    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { leaderApi } from "../api/leaderApi";
import type { LeaderApplicationRecord } from "../types/leaders";

const pending = ref<LeaderApplicationRecord[]>([]);
const loadingId = ref<number | null>(null);
const message = ref("");
const error = ref("");
const commissionEligibleById = ref<Record<number, boolean>>({});

const formatDate = (value: string) => new Date(value).toLocaleString();

const loadPending = async () => {
  error.value = "";
  try {
    const response = await leaderApi.getPendingApplications();
    pending.value = response.data;

    const nextEligibility: Record<number, boolean> = {};
    for (const item of response.data) {
      nextEligibility[item.id] =
        commissionEligibleById.value[item.id] ??
        item.requestedCommissionEligible;
    }
    commissionEligibleById.value = nextEligibility;
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : "Failed to load pending applications.";
  }
};

const review = async (
  applicationId: number,
  decision: "APPROVE" | "REJECT",
) => {
  loadingId.value = applicationId;
  error.value = "";
  message.value = "";
  try {
    const commissionEligible =
      commissionEligibleById.value[applicationId] ?? false;

    await leaderApi.decideApplication(applicationId, {
      decision,
      reason:
        decision === "APPROVE"
          ? "Credentials verified and approved."
          : "Application rejected due to incomplete requirements.",
      commissionEligible,
    });
    message.value = `Application #${applicationId} ${decision === "APPROVE" ? "approved" : "rejected"} with commission eligibility set to ${commissionEligible ? "eligible" : "not eligible"}.`;
    await loadPending();
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to submit decision.";
  } finally {
    loadingId.value = null;
  }
};

onMounted(loadPending);
</script>
