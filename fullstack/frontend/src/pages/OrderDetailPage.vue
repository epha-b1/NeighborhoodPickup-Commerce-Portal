<template>
  <section class="page-card" v-if="order">
    <div class="split-head">
      <div>
        <h1>Order #{{ order.id }}</h1>
        <p class="muted">Status: {{ order.status }}</p>
      </div>
      <div class="inline-actions">
        <router-link class="link-btn" :to="backPath"
          >Back to Cycles</router-link
        >
        <router-link
          class="link-btn"
          :to="`/appeals/new?source=order-detail&orderId=${order.id}`"
        >
          Submit Appeal
        </router-link>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <h3>Pickup Window</h3>
        <p>
          {{ order.pickupWindow.date }} {{ order.pickupWindow.startTime }}-{{
            order.pickupWindow.endTime
          }}
        </p>
      </div>
      <div class="info-card">
        <h3>Totals</h3>
        <p>Subtotal: ${{ order.totals.subtotal.toFixed(2) }}</p>
        <p>Discount: ${{ order.totals.discount.toFixed(2) }}</p>
        <p>Subsidy: ${{ order.totals.subsidy.toFixed(2) }}</p>
        <p>Tax: ${{ order.totals.tax.toFixed(2) }}</p>
        <p>
          <strong>Total: ${{ order.totals.total.toFixed(2) }}</strong>
        </p>
      </div>
    </div>

    <h3>Line Items</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Listing ID</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Subtotal</th>
            <th>Discount</th>
            <th>Subsidy</th>
            <th>Tax</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in order.items" :key="item.listingId">
            <td>{{ item.listingId }}</td>
            <td>{{ item.quantity }}</td>
            <td>${{ item.unitPrice.toFixed(2) }}</td>
            <td>${{ item.lineSubtotal.toFixed(2) }}</td>
            <td>${{ item.lineDiscount.toFixed(2) }}</td>
            <td>${{ item.lineSubsidy.toFixed(2) }}</td>
            <td>${{ item.lineTax.toFixed(2) }}</td>
            <td>${{ item.lineTotal.toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h3>Pricing Trace</h3>
    <pre class="trace-block">{{ prettyTrace }}</pre>
  </section>

  <section v-else class="page-card">
    <h1>Order Detail</h1>
    <p v-if="loading" class="muted">Loading order...</p>
    <p v-else class="error-text">{{ error || "Order not found." }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { resolveRoleHomePath } from "../constants/roles";
import { orderApi } from "../api/orderApi";
import { useAuthStore } from "../stores/authStore";
import type { OrderDetail } from "../types/orders";

const route = useRoute();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref("");
const order = ref<OrderDetail | null>(null);

const orderId = computed(() => Number(route.params.id));
const prettyTrace = computed(() =>
  JSON.stringify(order.value?.pricingTrace ?? {}, null, 2),
);
const backPath = computed(() =>
  authStore.roles.includes("MEMBER")
    ? "/member/cycles"
    : resolveRoleHomePath(authStore.roles) ?? "/login",
);

const fetchOrder = async () => {
  loading.value = true;
  error.value = "";
  try {
    order.value = await orderApi.getOrder(orderId.value);
  } catch (err) {
    order.value = null;
    error.value = err instanceof Error ? err.message : "Failed to load order.";
  } finally {
    loading.value = false;
  }
};

onMounted(fetchOrder);
</script>
