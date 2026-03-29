<template>
  <section class="page-card">
    <div class="split-head">
      <div>
        <h1>Listings</h1>
        <p class="muted">Cycle ID: {{ cycleIdLabel }}</p>
      </div>
      <router-link class="link-btn" to="/member/cycles"
        >Back to Cycles</router-link
      >
    </div>

    <div class="toolbar-grid">
      <label>
        Search
        <input v-model="search" placeholder="title or description" />
      </label>
      <label>
        Sort By
        <select v-model="sortBy">
          <option value="recent">Recent</option>
          <option value="title">Title</option>
          <option value="price">Price</option>
        </select>
      </label>
      <label>
        Direction
        <select v-model="sortDir">
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </label>
      <button @click="fetchListings">Apply</button>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>
    <div v-if="loading" class="muted">Loading listings...</div>

    <div v-else-if="listings.length === 0" class="muted">
      No listings found for the cycle.
    </div>
    <div v-else class="listing-grid">
      <article
        v-for="listing in listings"
        :key="listing.id"
        class="listing-card"
      >
        <h3>{{ listing.title }}</h3>
        <p class="muted">{{ listing.description }}</p>
        <p>
          <strong>${{ listing.basePrice }}</strong> / {{ listing.unitLabel }}
        </p>
        <p class="small-text">
          Available: {{ listing.availableQuantity - listing.reservedQuantity }}
        </p>
        <p class="small-text">Pickup Point: {{ listing.pickupPointName }}</p>
        <p class="small-text">Leader: {{ listing.leaderUsername }}</p>
        <div class="inline-actions">
          <button
            @click="toggleFavorite('PICKUP_POINT', listing.pickupPointId)"
          >
            {{
              listing.isFavoritePickupPoint
                ? "Unfavorite Pickup Point"
                : "Favorite Pickup Point"
            }}
          </button>
          <button @click="toggleFavorite('LEADER', listing.leaderUserId)">
            {{
              listing.isFavoriteLeader ? "Unfavorite Leader" : "Favorite Leader"
            }}
          </button>
          <button @click="goToPickupPoint(listing.pickupPointId)">
            Pickup Point Detail
          </button>
          <button @click="goToCheckout(listing)">Checkout</button>
        </div>
      </article>
    </div>

    <div class="pager-row">
      <button :disabled="page === 1 || loading" @click="prevPage">
        Previous
      </button>
      <span>Page {{ page }} of {{ maxPage }}</span>
      <button :disabled="page >= maxPage || loading" @click="nextPage">
        Next
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { commerceApi } from "../api/commerceApi";
import type { ListingItem } from "../types/commerce";
import { useCheckoutStore } from "../stores/checkoutStore";
import { trackEvent } from "../telemetry/trackEvent";

const route = useRoute();
const router = useRouter();
const checkoutStore = useCheckoutStore();

const loading = ref(false);
const error = ref("");
const listings = ref<ListingItem[]>([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const search = ref("");
const sortBy = ref<"title" | "price" | "recent">("recent");
const sortDir = ref<"asc" | "desc">("desc");

const cycleId = computed(() => Number(route.query.cycleId ?? 0));
const cycleIdLabel = computed(() =>
  cycleId.value > 0 ? String(cycleId.value) : "missing",
);
const maxPage = computed(() =>
  Math.max(1, Math.ceil(total.value / pageSize.value)),
);

const fetchListings = async () => {
  if (!cycleId.value) {
    error.value = "Missing cycleId query parameter.";
    listings.value = [];
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    const response = await commerceApi.getListings({
      cycleId: cycleId.value,
      page: page.value,
      pageSize: pageSize.value,
      search: search.value,
      sortBy: sortBy.value,
      sortDir: sortDir.value,
    });

    listings.value = response.data;
    total.value = response.total;
    await trackEvent({
      eventType: "IMPRESSION",
      resourceType: "LISTINGS_PAGE",
      resourceId: String(cycleId.value),
      payload: {
        page: page.value,
        count: response.data.length,
      },
    });
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to load listings.";
    listings.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

const toggleFavorite = async (
  type: "PICKUP_POINT" | "LEADER",
  targetId: number,
) => {
  try {
    await commerceApi.toggleFavorite({ type, targetId });
    await trackEvent({
      eventType: "FAVORITE",
      resourceType: type,
      resourceId: String(targetId),
      payload: { source: "listings" },
    });
    await fetchListings();
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to toggle favorite.";
  }
};

const goToPickupPoint = async (pickupPointId: number) => {
  await router.push({
    name: "pickup-point-detail",
    params: { id: String(pickupPointId) },
  });
};

const goToCheckout = async (listing: ListingItem) => {
  await trackEvent({
    eventType: "CLICK",
    resourceType: "LISTING_CHECKOUT",
    resourceId: String(listing.id),
    payload: {
      pickupPointId: listing.pickupPointId,
    },
  });
  checkoutStore.setListing(listing);
  await router.push({
    name: "checkout",
    query: {
      cycleId: String(listing.cycleId),
      pickupPointId: String(listing.pickupPointId),
    },
  });
};

const prevPage = async () => {
  if (page.value > 1) {
    page.value -= 1;
    await fetchListings();
  }
};

const nextPage = async () => {
  if (page.value < maxPage.value) {
    page.value += 1;
    await fetchListings();
  }
};

onMounted(fetchListings);
</script>
