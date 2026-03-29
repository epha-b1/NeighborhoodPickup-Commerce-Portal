<template>
  <article class="comment-card" :class="{ hidden: comment.isHidden }">
    <div class="comment-head">
      <strong>{{ comment.username }}</strong>
      <span class="small-text muted">{{ formatDate(comment.createdAt) }}</span>
    </div>

    <div v-if="comment.isHidden" class="hidden-banner">
      <p>
        Hidden due to moderation flags.
        {{ comment.hiddenReason || "Reason pending." }}
      </p>
      <div class="inline-actions">
        <button @click="collapsed = !collapsed">
          {{ collapsed ? "Expand hidden content" : "Collapse hidden content" }}
        </button>
        <button @click="$emit('appeal', comment.id)">
          Appeal this moderation
        </button>
      </div>
    </div>

    <template v-if="!comment.isHidden || !collapsed">
      <blockquote v-if="comment.quotedBody" class="quote-text">
        {{ comment.quotedBody }}
      </blockquote>
      <p class="comment-body" v-html="renderBody(comment.body)"></p>
    </template>

    <div class="inline-actions">
      <button @click="$emit('reply', comment.id)">Reply</button>
      <button @click="$emit('quote', comment.id)">Quote</button>
      <button @click="$emit('flag', comment.id)">Flag</button>
      <button @click="$emit('vote', comment.id)">Vote Helpful</button>
      <span class="small-text muted"
        >Replies: {{ comment.replyCount }} | Flags:
        {{ comment.flagCount }}</span
      >
    </div>
  </article>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { DiscussionComment } from "../../types/discussion";

const props = defineProps<{
  comment: DiscussionComment;
}>();

defineEmits<{
  reply: [commentId: number];
  quote: [commentId: number];
  flag: [commentId: number];
  appeal: [commentId: number];
  vote: [commentId: number];
}>();

const collapsed = ref(true);

const escapeHtml = (value: string) =>
  value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const renderBody = (value: string) => {
  const escaped = escapeHtml(value);
  return escaped.replace(
    /(@[a-zA-Z0-9_]{2,64})/g,
    '<span class="mention">$1</span>',
  );
};

const formatDate = (value: string) => new Date(value).toLocaleString();
</script>
