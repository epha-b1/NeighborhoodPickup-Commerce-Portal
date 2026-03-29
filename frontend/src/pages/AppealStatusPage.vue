<template>
  <section class="page-card" v-if="appeal">
    <div class="split-head">
      <div>
        <h1>Appeal #{{ appeal.id }}</h1>
        <p class="muted">Current status: {{ appeal.status }}</p>
      </div>
      <router-link class="link-btn" :to="backPath">Back</router-link>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <h3>Source</h3>
        <p>{{ appeal.sourceType }}</p>
        <p v-if="appeal.sourceCommentId" class="small-text">
          Comment ID: {{ appeal.sourceCommentId }}
        </p>
        <p v-if="appeal.sourceOrderId" class="small-text">
          Order ID: {{ appeal.sourceOrderId }}
        </p>
      </div>
      <div class="info-card">
        <h3>Reason</h3>
        <p>{{ appeal.reasonCategory }}</p>
        <p class="small-text muted">
          {{ appeal.referencesText || "No references provided." }}
        </p>
      </div>
    </div>

    <h3>Narrative</h3>
    <p class="comment-body">{{ appeal.narrative }}</p>

    <h3>Uploaded Files</h3>
    <div v-if="appeal.files.length === 0" class="muted">No files uploaded.</div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Type</th>
            <th>Size</th>
            <th>Checksum (SHA-256)</th>
            <th>Integrity</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="file in appeal.files" :key="file.id">
            <td>{{ file.originalFileName }}</td>
            <td>{{ file.mimeType }}</td>
            <td>{{ formatBytes(file.fileSizeBytes) }}</td>
            <td class="small-text">{{ file.checksumSha256 }}</td>
            <td>
              <strong>{{ file.integrityStatus || "UNVERIFIED" }}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <h3>Status Timeline</h3>
    <div class="notification-list">
      <article class="info-card" v-for="event in timeline" :key="event.id">
        <strong>{{ event.toStatus }}</strong>
        <p class="small-text muted">
          {{ event.fromStatus || "START" }} -> {{ event.toStatus }} |
          {{ formatDate(event.createdAt) }}
        </p>
        <p>{{ event.note }}</p>
      </article>
    </div>

    <div v-if="canModerate" class="info-card" style="margin-top: 1rem">
      <h3>Reviewer Action</h3>
      <label>
        Transition note
        <input v-model="transitionNote" placeholder="Add transition reason" />
      </label>
      <div class="inline-actions">
        <button
          v-if="appeal.status === 'INTAKE'"
          @click="transition('INVESTIGATION')"
          :disabled="transitioning"
        >
          Move to Investigation
        </button>
        <button
          v-if="appeal.status === 'INVESTIGATION'"
          @click="transition('RULING')"
          :disabled="transitioning"
        >
          Move to Ruling
        </button>
      </div>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>
  </section>

  <section v-else class="page-card">
    <h1>Appeal Status</h1>
    <p v-if="loading" class="muted">Loading appeal...</p>
    <p v-else class="error-text">{{ error || "Appeal not found." }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { appealApi } from "../api/appealApi";
import { hasAnyRole } from "../constants/roles";
import { useAuthStore } from "../stores/authStore";
import type { AppealDetail, AppealTimelineEvent } from "../types/appeals";
import type { RoleName } from "../types/auth";

const route = useRoute();
const authStore = useAuthStore();

const loading = ref(false);
const transitioning = ref(false);
const error = ref("");
const appeal = ref<AppealDetail | null>(null);
const timeline = ref<AppealTimelineEvent[]>([]);
const transitionNote = ref("");

const appealId = computed(() => Number(route.params.id));
const canModerate = computed(() =>
  authStore.roles.some(
    (role: RoleName) => role === "REVIEWER" || role === "ADMINISTRATOR",
  ),
);
const backPath = computed(() =>
  appeal.value?.sourceOrderId &&
  hasAnyRole(authStore.roles, ["MEMBER", "FINANCE_CLERK", "ADMINISTRATOR"])
    ? `/member/orders/${appeal.value.sourceOrderId}`
    : "/notifications",
);

const formatDate = (value: string) => new Date(value).toLocaleString();
const formatBytes = (size: number) => `${(size / 1024 / 1024).toFixed(2)} MB`;

const load = async () => {
  loading.value = true;
  error.value = "";
  try {
    const [detail, history] = await Promise.all([
      appealApi.getAppeal(appealId.value),
      appealApi.getTimeline(appealId.value),
    ]);
    appeal.value = detail;
    timeline.value = history.data;
  } catch (err) {
    appeal.value = null;
    timeline.value = [];
    error.value = err instanceof Error ? err.message : "Failed to load appeal.";
  } finally {
    loading.value = false;
  }
};

const transition = async (toStatus: "INVESTIGATION" | "RULING") => {
  if (!transitionNote.value.trim()) {
    error.value = "Transition note is required.";
    return;
  }

  transitioning.value = true;
  error.value = "";
  try {
    await appealApi.transitionStatus(
      appealId.value,
      toStatus,
      transitionNote.value.trim(),
    );
    transitionNote.value = "";
    await load();
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to transition appeal.";
  } finally {
    transitioning.value = false;
  }
};

onMounted(load);
</script>
