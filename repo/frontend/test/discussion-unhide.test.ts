/**
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ThreadCommentCard from "../src/components/discussion/ThreadCommentCard.vue";
import type { DiscussionComment } from "../src/types/discussion";

const hiddenComment: DiscussionComment = {
  id: 5,
  discussionId: 1,
  parentCommentId: null,
  userId: 2,
  username: "testuser",
  body: "Some content",
  quotedCommentId: null,
  quotedBody: null,
  isHidden: true,
  hiddenReason: "Flagged by community moderation",
  replyCount: 0,
  flagCount: 3,
  createdAt: "2026-04-01T00:00:00.000Z",
  mentions: [],
};

const visibleComment: DiscussionComment = {
  ...hiddenComment,
  isHidden: false,
  hiddenReason: null,
  flagCount: 0,
};

describe("ThreadCommentCard unhide button visibility", () => {
  it("shows 'Unhide Comment' button when canUnhide is true and comment is hidden", () => {
    const wrapper = mount(ThreadCommentCard, {
      props: {
        comment: hiddenComment,
        canUnhide: true,
      },
    });

    const buttons = wrapper.findAll("button");
    const unhideButton = buttons.find((b) => b.text() === "Unhide Comment");
    expect(unhideButton).toBeDefined();
    expect(unhideButton!.exists()).toBe(true);
  });

  it("does NOT show 'Unhide Comment' button when canUnhide is false", () => {
    const wrapper = mount(ThreadCommentCard, {
      props: {
        comment: hiddenComment,
        canUnhide: false,
      },
    });

    const buttons = wrapper.findAll("button");
    const unhideButton = buttons.find((b) => b.text() === "Unhide Comment");
    expect(unhideButton).toBeUndefined();
  });

  it("does NOT show 'Unhide Comment' button when comment is not hidden", () => {
    const wrapper = mount(ThreadCommentCard, {
      props: {
        comment: visibleComment,
        canUnhide: true,
      },
    });

    const buttons = wrapper.findAll("button");
    const unhideButton = buttons.find((b) => b.text() === "Unhide Comment");
    expect(unhideButton).toBeUndefined();
  });
});
