<template>
  <section class="page-card">
    <div class="split-head">
      <div>
        <h1>Discussion Thread</h1>
        <p class="muted">Context: {{ contextType }} #{{ contextId }}</p>
      </div>
      <router-link class="link-btn" :to="backPath">Back</router-link>
    </div>

    <div class="toolbar-grid">
      <label>
        Sort
        <select v-model="sort">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="most_replies">Most Replies</option>
        </select>
      </label>
      <button @click="loadThread">Refresh</button>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>

    <div class="info-card">
      <h3>Add Comment</h3>
      <textarea
        v-model="commentBody"
        class="comment-input"
        rows="4"
        placeholder="Type a comment, use @username for mention"
      />
      <div class="inline-actions">
        <button @click="submitComment">Post Comment</button>
        <span v-if="replyToId" class="small-text muted"
          >Replying to comment #{{ replyToId }}</span
        >
        <span v-if="quotedCommentId" class="small-text muted"
          >Quoting comment #{{ quotedCommentId }}</span
        >
      </div>
    </div>

    <div v-if="loading" class="muted">Loading comments...</div>

    <div v-else-if="comments.length === 0" class="muted">No comments yet.</div>
    <div v-else class="comment-list">
      <ThreadCommentCard
        v-for="comment in comments"
        :key="comment.id"
        :comment="comment"
        @reply="onReply"
        @quote="onQuote"
        @flag="onFlag"
        @appeal="onAppeal"
        @vote="onVote"
      />
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

    <div class="inline-actions">
      <button @click="markThreadReviewed">Mark Thread Reviewed</button>
      <span v-if="reviewMessage" class="small-text muted">{{ reviewMessage }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import ThreadCommentCard from "../../components/discussion/ThreadCommentCard.vue";
import { discussionApi } from "../../api/discussionApi";
import { hasAnyRole, resolveRoleHomePath } from "../../constants/roles";
import { useAuthStore } from "../../stores/authStore";
import { trackEvent } from "../../telemetry/trackEvent";
import type { DiscussionComment } from "../../types/discussion";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref("");
const comments = ref<DiscussionComment[]>([]);
const total = ref(0);
const page = ref(1);
const sort = ref<"newest" | "oldest" | "most_replies">("newest");

const discussionId = computed(() => Number(route.params.id));
const contextType = ref<"LISTING" | "ORDER">("LISTING");
const contextId = ref(0);

const commentBody = ref("");
const replyToId = ref<number | undefined>();
const quotedCommentId = ref<number | undefined>();
const reviewMessage = ref("");

const maxPage = computed(() => Math.max(1, Math.ceil(total.value / 20)));
const backPath = computed(() => {
  if (
    contextType.value === "ORDER" &&
    hasAnyRole(authStore.roles, ["MEMBER", "FINANCE_CLERK", "ADMINISTRATOR"])
  ) {
    return `/member/orders/${contextId.value}`;
  }

  if (authStore.roles.includes("MEMBER")) {
    return "/member/cycles";
  }

  return resolveRoleHomePath(authStore.roles) ?? "/notifications";
});

const loadThread = async () => {
  loading.value = true;
  error.value = "";
  try {
    const response = await discussionApi.getThreadComments({
      discussionId: discussionId.value,
      page: page.value,
      sort: sort.value,
    });
    comments.value = response.comments;
    total.value = response.total;
    contextType.value = response.contextType;
    contextId.value = response.contextId;
    await trackEvent({
      eventType: "IMPRESSION",
      resourceType: "DISCUSSION_THREAD",
      resourceId: String(discussionId.value),
      payload: { page: page.value, sort: sort.value },
    });
  } catch (err) {
    comments.value = [];
    total.value = 0;
    error.value = err instanceof Error ? err.message : "Failed to load thread.";
  } finally {
    loading.value = false;
  }
};

const submitComment = async () => {
  if (!commentBody.value.trim()) {
    return;
  }

  try {
    await discussionApi.createComment({
      contextType: contextType.value,
      contextId: contextId.value,
      parentCommentId: replyToId.value,
      quotedCommentId: quotedCommentId.value,
      body: commentBody.value,
    });

    commentBody.value = "";
    replyToId.value = undefined;
    quotedCommentId.value = undefined;
    await loadThread();
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to post comment.";
  }
};

const onReply = (commentId: number) => {
  replyToId.value = commentId;
  quotedCommentId.value = undefined;
};

const onQuote = (commentId: number) => {
  quotedCommentId.value = commentId;
  replyToId.value = commentId;
};

const onFlag = async (commentId: number) => {
  try {
    await discussionApi.flagComment(
      commentId,
      "Flagged by user for moderation review",
    );
    await loadThread();
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to flag comment.";
  }
};

const onAppeal = async (commentId: number) => {
  await router.push({
    path: "/appeals/new",
    query: {
      source: "hidden-content-banner",
      commentId: String(commentId),
    },
  });
};

const onVote = async (commentId: number) => {
  reviewMessage.value = "";
  try {
    await trackEvent({
      eventType: "VOTE",
      resourceType: "DISCUSSION_COMMENT",
      resourceId: String(commentId),
      payload: {
        discussionId: discussionId.value,
        vote: "HELPFUL",
      },
    });
    reviewMessage.value = `Vote recorded for comment #${commentId}.`;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to record vote.";
  }
};

const markThreadReviewed = async () => {
  reviewMessage.value = "";
  try {
    await trackEvent({
      eventType: "WATCH_COMPLETION",
      resourceType: "DISCUSSION_THREAD",
      resourceId: String(discussionId.value),
      payload: {
        page: page.value,
        totalComments: total.value,
      },
    });
    reviewMessage.value = "Thread review completion recorded.";
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to record review completion.";
  }
};

const prevPage = async () => {
  if (page.value > 1) {
    page.value -= 1;
    await loadThread();
  }
};

const nextPage = async () => {
  if (page.value < maxPage.value) {
    page.value += 1;
    await loadThread();
  }
};

onMounted(loadThread);
</script>
