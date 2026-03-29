<template>
  <section class="page-card">
    <div class="split-head">
      <div>
        <h1>Checkout</h1>
        <p class="muted">Review quote and submit order.</p>
      </div>
      <router-link class="link-btn" :to="backToListingsPath">Back to Listings</router-link>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>

    <div v-if="!selectedListing" class="muted">
      Select a listing from the listings page to start checkout.
    </div>

    <div v-else>
      <div class="info-grid">
        <div class="info-card">
          <h3>Listing</h3>
          <p><strong>{{ selectedListing.title }}</strong></p>
          <p>${{ selectedListing.basePrice }} / {{ selectedListing.unitLabel }}</p>
          <p class="small-text">Available: {{ selectedListing.availableQuantity - selectedListing.reservedQuantity }}</p>
        </div>

        <div class="info-card" v-if="pickupPoint">
          <h3>Pickup Point</h3>
          <p><strong>{{ pickupPoint.name }}</strong></p>
          <p class="small-text">Remaining Today: {{ pickupPoint.remainingCapacityToday }}</p>
        </div>
      </div>

      <div class="toolbar-grid">
        <label>
          Quantity
          <input type="number" min="1" v-model.number="quantity" />
        </label>
        <label>
          Pickup Window
          <select v-model.number="selectedWindowId">
            <option v-for="window in windowOptions" :key="window.windowId" :value="window.windowId">
              {{ window.date }} {{ window.startTime }}-{{ window.endTime }} (remaining: {{ window.remainingCapacity }})
            </option>
          </select>
        </label>
        <label>
          Tax Jurisdiction
          <input v-model="taxJurisdictionCode" />
        </label>
        <button @click="fetchQuote">Refresh Quote</button>
      </div>

      <div v-if="quote" class="info-card">
        <h3>Quote Breakdown</h3>
        <p>Subtotal: ${{ quote.subtotal.toFixed(2) }}</p>
        <p>Discounts: ${{ quote.discountTotal.toFixed(2) }}</p>
        <p>Subsidies: ${{ quote.subsidyTotal.toFixed(2) }}</p>
        <p>Tax: ${{ quote.taxTotal.toFixed(2) }}</p>
        <p><strong>Total: ${{ quote.grandTotal.toFixed(2) }}</strong></p>

        <h4>Line Items</h4>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Subtotal</th>
                <th>Discount</th>
                <th>Subsidy</th>
                <th>Tax</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in quote.lineItems" :key="line.listingId">
                <td>{{ line.title }}</td>
                <td>{{ line.quantity }}</td>
                <td>${{ line.subtotal.toFixed(2) }}</td>
                <td>
                  ${{
                    (
                      line.memberPricingAdjustment +
                      line.tieredDiscount +
                      line.cappedDiscount
                    ).toFixed(2)
                  }}
                </td>
                <td>${{ line.subsidy.toFixed(2) }}</td>
                <td>${{ line.taxAmount.toFixed(2) }}</td>
                <td>${{ line.total.toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <button :disabled="checkoutLoading || !quote" @click="submitCheckout">
        {{ checkoutLoading ? 'Submitting...' : 'Submit Checkout' }}
      </button>

      <div v-if="capacityConflict" class="info-card">
        <h3>Capacity Conflict</h3>
        <p class="error-text">{{ capacityConflict.message }}</p>
        <p class="muted">Next available windows:</p>
        <ul>
          <li v-for="alt in capacityConflict.alternatives" :key="alt.pickupWindowId">
            {{ alt.windowDate }} {{ alt.startTime }}-{{ alt.endTime }}
            (remaining {{ alt.remainingCapacity }})
            <button @click="useAlternativeWindow(alt.pickupWindowId)">Use</button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { commerceApi } from '../api/commerceApi';
import { orderApi } from '../api/orderApi';
import { useCheckoutStore } from '../stores/checkoutStore';
import type { CheckoutResponse, OrderQuote } from '../types/orders';

const route = useRoute();
const router = useRouter();
const checkoutStore = useCheckoutStore();

const pickupPoint = ref<Awaited<ReturnType<typeof commerceApi.getPickupPoint>> | null>(null);
const quote = ref<OrderQuote | null>(null);
const error = ref('');
const checkoutLoading = ref(false);
const capacityConflict = ref<Extract<CheckoutResponse, { ok: false }>['conflict'] | null>(null);

const selectedListing = computed(() => checkoutStore.selectedListing);
const quantity = computed({
  get: () => checkoutStore.quantity,
  set: (value: number) => checkoutStore.setQuantity(Math.max(1, value))
});
const selectedWindowId = computed({
  get: () => checkoutStore.selectedWindowId,
  set: (value: number | null) => {
    if (value) {
      checkoutStore.setWindow(value);
    }
  }
});

const cycleId = computed(() => Number(route.query.cycleId ?? selectedListing.value?.cycleId ?? 0));
const pickupPointId = computed(() =>
  Number(route.query.pickupPointId ?? selectedListing.value?.pickupPointId ?? 0)
);
const backToListingsPath = computed(() => ({
  name: 'listings',
  query: { cycleId: String(cycleId.value) }
}));

const taxJurisdictionCode = ref('US-IL-SPRINGFIELD');

const windowOptions = computed(() => pickupPoint.value?.windows ?? []);

const ensurePickupPoint = async () => {
  if (!pickupPointId.value) {
    return;
  }

  pickupPoint.value = await commerceApi.getPickupPoint(pickupPointId.value);
  checkoutStore.setPickupPoint(pickupPoint.value);
};

const currentPayload = () => {
  if (!selectedListing.value || !selectedWindowId.value) {
    throw new Error('Select listing and pickup window first.');
  }

  return {
    cycleId: cycleId.value,
    pickupPointId: pickupPointId.value,
    pickupWindowId: selectedWindowId.value,
    taxJurisdictionCode: taxJurisdictionCode.value,
    items: [
      {
        listingId: selectedListing.value.id,
        quantity: quantity.value
      }
    ]
  };
};

const fetchQuote = async () => {
  error.value = '';
  capacityConflict.value = null;

  try {
    const payload = currentPayload();
    quote.value = await orderApi.quote(payload);
  } catch (err) {
    quote.value = null;
    error.value = err instanceof Error ? err.message : 'Failed to generate quote.';
  }
};

const submitCheckout = async () => {
  checkoutLoading.value = true;
  error.value = '';
  capacityConflict.value = null;

  try {
    const payload = currentPayload();
    const result = await orderApi.checkout(payload);

    if (!result.ok) {
      if (result.code === 'CAPACITY_EXCEEDED') {
        capacityConflict.value = result.conflict ?? null;
      }
      error.value = result.message;
      return;
    }

    checkoutStore.clear();
    await router.push({ name: 'order-detail', params: { id: String(result.orderId) } });
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Checkout failed.';
  } finally {
    checkoutLoading.value = false;
  }
};

const useAlternativeWindow = async (windowId: number) => {
  checkoutStore.setWindow(windowId);
  await fetchQuote();
};

onMounted(async () => {
  try {
    await ensurePickupPoint();
    if (selectedListing.value) {
      await fetchQuote();
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to initialize checkout.';
  }
});
</script>