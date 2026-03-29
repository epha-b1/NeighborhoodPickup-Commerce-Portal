<template>
  <section class="page-card">
    <h1>Create Appeal</h1>
    <p class="muted">
      Submit evidence and track status through intake, investigation, and
      ruling.
    </p>

    <div class="info-card" style="margin-bottom: 0.75rem">
      <p><strong>Source:</strong> {{ sourceTypeLabel }}</p>
      <p v-if="sourceCommentId" class="small-text">
        Comment ID: {{ sourceCommentId }}
      </p>
      <p v-if="sourceOrderId" class="small-text">
        Order ID: {{ sourceOrderId }}
      </p>
    </div>

    <form class="form-stack" @submit.prevent="submitAppeal">
      <label>
        Reason Category
        <select v-model="reasonCategory">
          <option value="MODERATION">Moderation</option>
          <option value="ORDER_ISSUE">Order Issue</option>
          <option value="FULFILLMENT">Fulfillment</option>
          <option value="QUALITY">Quality</option>
          <option value="OTHER">Other</option>
        </select>
      </label>

      <label>
        Narrative
        <textarea
          v-model="narrative"
          rows="6"
          placeholder="Describe what happened and what resolution you are requesting."
        />
      </label>

      <label>
        References (optional)
        <input
          v-model="referencesText"
          maxlength="500"
          placeholder="Order item IDs, policy references, timestamps"
        />
      </label>

      <label>
        Upload Evidence (PDF/JPG/PNG, max 10MB each, max 5 files)
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          multiple
          @change="onFilesSelected"
        />
      </label>

      <div class="small-text muted" v-if="selectedFiles.length > 0">
        {{ selectedFiles.length }} file(s) selected.
      </div>

      <div class="inline-actions">
        <button type="submit" :disabled="submitting">Submit Appeal</button>
        <router-link class="link-btn" :to="cancelPath">Cancel</router-link>
      </div>

      <div
        v-if="uploadProgress > 0 && uploadProgress < 100"
        class="small-text muted"
      >
        Upload progress: {{ uploadProgress }}%
      </div>
    </form>

    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { appealApi } from "../api/appealApi";
import { hasAnyRole } from "../constants/roles";
import { useAuthStore } from "../stores/authStore";
import type { AppealReasonCategory } from "../types/appeals";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const reasonCategory = ref<AppealReasonCategory>("MODERATION");
const narrative = ref("");
const referencesText = ref("");
const selectedFiles = ref<File[]>([]);
const submitting = ref(false);
const error = ref("");
const uploadProgress = ref(0);

const source = computed(() =>
  String(route.query.source ?? "hidden-content-banner"),
);
const sourceType = computed(() =>
  source.value === "order-detail" ? "ORDER_DETAIL" : "HIDDEN_CONTENT_BANNER",
);
const sourceTypeLabel = computed(() =>
  sourceType.value === "ORDER_DETAIL"
    ? "Order Detail"
    : "Hidden Content Banner",
);
const sourceCommentId = computed(() => {
  const value = Number(route.query.commentId);
  return Number.isFinite(value) && value > 0 ? value : undefined;
});
const sourceOrderId = computed(() => {
  const value = Number(route.query.orderId);
  return Number.isFinite(value) && value > 0 ? value : undefined;
});

const cancelPath = computed(() => {
  if (
    sourceOrderId.value &&
    hasAnyRole(authStore.roles, ["MEMBER", "FINANCE_CLERK", "ADMINISTRATOR"])
  ) {
    return `/member/orders/${sourceOrderId.value}`;
  }
  return "/notifications";
});

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });

const onFilesSelected = (event: Event) => {
  const target = event.target as HTMLInputElement;
  selectedFiles.value = target.files ? Array.from(target.files) : [];
};

const submitAppeal = async () => {
  error.value = "";

  if (narrative.value.trim().length < 20) {
    error.value = "Narrative must be at least 20 characters.";
    return;
  }

  if (selectedFiles.value.length > 5) {
    error.value = "You can upload up to 5 files.";
    return;
  }

  const oversized = selectedFiles.value.find(
    (file) => file.size > 10 * 1024 * 1024,
  );
  if (oversized) {
    error.value = `${oversized.name} exceeds the 10MB limit.`;
    return;
  }

  submitting.value = true;
  uploadProgress.value = 0;

  try {
    const created = await appealApi.createAppeal({
      sourceType: sourceType.value,
      sourceCommentId: sourceCommentId.value,
      sourceOrderId: sourceOrderId.value,
      reasonCategory: reasonCategory.value,
      narrative: narrative.value.trim(),
      referencesText: referencesText.value.trim() || undefined,
    });

    if (selectedFiles.value.length > 0) {
      const encodedFiles = [] as Array<{
        fileName: string;
        mimeType: string;
        base64Content: string;
      }>;
      for (let index = 0; index < selectedFiles.value.length; index += 1) {
        const file = selectedFiles.value[index];
        const base64Content = await toBase64(file);
        encodedFiles.push({
          fileName: file.name,
          mimeType: file.type,
          base64Content,
        });
        uploadProgress.value = Math.round(
          ((index + 1) / selectedFiles.value.length) * 100,
        );
      }

      await appealApi.uploadFiles(created.id, encodedFiles);
    }

    await router.push(`/appeals/${created.id}`);
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to submit appeal.";
  } finally {
    submitting.value = false;
  }
};
</script>
