<template>
  <section class="page-card">
    <div class="split-head">
      <h1>Audit Logs</h1>
      <div class="inline-actions">
        <button @click="exportCsv" :disabled="exporting">Export CSV</button>
        <button @click="verifyChain" :disabled="verifying">Verify Chain</button>
      </div>
    </div>

    <div class="toolbar-grid">
      <label>
        Actor User ID
        <input v-model.number="filters.actorUserId" type="number" min="1" placeholder="Any" />
      </label>
      <label>
        Resource Type
        <input v-model="filters.resourceType" placeholder="e.g. APPEAL" />
      </label>
      <label>
        Action
        <select v-model="filters.action">
          <option value="">Any</option>
          <option value="UPLOAD">UPLOAD</option>
          <option value="DOWNLOAD">DOWNLOAD</option>
          <option value="SHARE">SHARE</option>
          <option value="PERMISSION_CHANGE">PERMISSION_CHANGE</option>
          <option value="APPROVAL">APPROVAL</option>
          <option value="DELETE">DELETE</option>
          <option value="ROLLBACK">ROLLBACK</option>
        </select>
      </label>
      <label>
        From
        <input v-model="filters.from" type="date" />
      </label>
      <label>
        To
        <input v-model="filters.to" type="date" />
      </label>
      <button @click="searchLogs">Search</button>
    </div>

    <p v-if="chainResult" :class="chainResult.valid ? 'muted' : 'error-text'">
      Chain verification: {{ chainResult.valid ? 'VALID' : 'INVALID' }}
      ({{ chainResult.total }} entries{{ chainResult.failures.length > 0 ? `, ${chainResult.failures.length} failures` : '' }})
    </p>

    <p v-if="error" class="error-text">{{ error }}</p>
    <div v-if="loading" class="muted">Loading audit logs...</div>

    <div v-else-if="logs.length === 0" class="muted">No audit log entries found.</div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Resource</th>
            <th>Resource ID</th>
            <th>Timestamp</th>
            <th>Hash</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td>{{ log.id }}</td>
            <td>{{ log.actorUserId ?? 'System' }}</td>
            <td>{{ log.action }}</td>
            <td>{{ log.resourceType }}</td>
            <td>{{ log.resourceId ?? '-' }}</td>
            <td class="small-text">{{ formatDate(log.createdAt) }}</td>
            <td class="small-text">{{ log.currentHash.slice(0, 12) }}...</td>
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
import { computed, onMounted, reactive, ref } from 'vue';
import { auditApi, type AuditChainResult, type AuditLogEntry } from '../api/auditApi';

const loading = ref(false);
const exporting = ref(false);
const verifying = ref(false);
const error = ref('');
const logs = ref<AuditLogEntry[]>([]);
const page = ref(1);
const total = ref(0);
const chainResult = ref<AuditChainResult | null>(null);

const filters = reactive({
  actorUserId: undefined as number | undefined,
  resourceType: '',
  action: '',
  from: '',
  to: '',
});

const maxPage = computed(() => Math.max(1, Math.ceil(total.value / 20)));
const formatDate = (value: string) => new Date(value).toLocaleString();

const searchLogs = async () => {
  loading.value = true;
  error.value = '';
  try {
    const result = await auditApi.searchLogs({
      page: page.value,
      pageSize: 20,
      actorUserId: filters.actorUserId || undefined,
      resourceType: filters.resourceType || undefined,
      action: filters.action || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    });
    logs.value = result.data;
    total.value = result.total;
  } catch (err) {
    logs.value = [];
    total.value = 0;
    error.value = err instanceof Error ? err.message : 'Failed to load audit logs.';
  } finally {
    loading.value = false;
  }
};

const exportCsv = async () => {
  exporting.value = true;
  error.value = '';
  try {
    const csv = await auditApi.exportCsv({
      actorUserId: filters.actorUserId || undefined,
      resourceType: filters.resourceType || undefined,
      action: filters.action || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'audit-logs.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to export audit logs.';
  } finally {
    exporting.value = false;
  }
};

const verifyChain = async () => {
  verifying.value = true;
  error.value = '';
  try {
    chainResult.value = await auditApi.verifyChain();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to verify chain.';
  } finally {
    verifying.value = false;
  }
};

const prevPage = async () => {
  if (page.value > 1) { page.value -= 1; await searchLogs(); }
};

const nextPage = async () => {
  if (page.value < maxPage.value) { page.value += 1; await searchLogs(); }
};

onMounted(searchLogs);
</script>
