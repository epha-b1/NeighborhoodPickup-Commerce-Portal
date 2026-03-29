<template>
  <section class="page-card">
    <div class="split-head">
      <div>
        <h1>Withdrawal Blacklist</h1>
        <p class="muted">
          Administrator controls for risk-managed withdrawals.
        </p>
      </div>
      <router-link class="link-btn" to="/home/administrator">Back</router-link>
    </div>

    <div class="toolbar-grid">
      <label>
        User ID
        <input type="number" min="1" v-model.number="newUserId" />
      </label>
      <label>
        Reason
        <input
          v-model="newReason"
          maxlength="255"
          placeholder="Policy breach / fraud signal"
        />
      </label>
      <label>
        Active
        <select v-model="newActive">
          <option :value="true">Active</option>
          <option :value="false">Inactive</option>
        </select>
      </label>
      <button @click="createOrUpdate">Save Entry</button>
    </div>

    <div class="table-wrap" v-if="entries.length > 0">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>User ID</th>
            <th>Reason</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry.id">
            <td>{{ entry.id }}</td>
            <td>{{ entry.userId }}</td>
            <td>{{ entry.reason }}</td>
            <td>{{ entry.active ? "Yes" : "No" }}</td>
            <td class="inline-actions">
              <button @click="toggle(entry.id, !entry.active)">
                {{ entry.active ? "Deactivate" : "Activate" }}
              </button>
              <button @click="remove(entry.id)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-else class="muted">No blacklist entries yet.</p>
    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { financeApi } from "../api/financeApi";
import type { BlacklistRecord } from "../types/finance";

const entries = ref<BlacklistRecord[]>([]);
const error = ref("");

const newUserId = ref<number | null>(null);
const newReason = ref("");
const newActive = ref(true);

const load = async () => {
  error.value = "";
  try {
    const response = await financeApi.listBlacklist();
    entries.value = response.data;
  } catch (err) {
    entries.value = [];
    error.value =
      err instanceof Error ? err.message : "Failed to load blacklist.";
  }
};

const createOrUpdate = async () => {
  if (!newUserId.value || newUserId.value <= 0) {
    error.value = "User ID is required.";
    return;
  }

  if (newReason.value.trim().length < 3) {
    error.value = "Reason must be at least 3 characters.";
    return;
  }

  error.value = "";
  try {
    await financeApi.upsertBlacklist({
      userId: newUserId.value,
      reason: newReason.value.trim(),
      active: newActive.value,
    });

    newUserId.value = null;
    newReason.value = "";
    newActive.value = true;

    await load();
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to save blacklist entry.";
  }
};

const toggle = async (id: number, active: boolean) => {
  error.value = "";
  try {
    await financeApi.patchBlacklist(id, { active });
    await load();
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to update entry.";
  }
};

const remove = async (id: number) => {
  error.value = "";
  try {
    await financeApi.deleteBlacklist(id);
    await load();
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to delete entry.";
  }
};

onMounted(load);
</script>
