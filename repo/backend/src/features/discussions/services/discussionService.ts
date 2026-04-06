import {
  addCommentFlag,
  createComment,
  createCommentMentions,
  createNotification,
  doesListingExist,
  doesOrderExist,
  findCommentById,
  findUsersByUsernames,
  getDiscussionById,
  getNotifications,
  getOrCreateDiscussion,
  getThreadCommentsPage,
  isOrderOwnedByUser,
  setCommentVisible,
  updateNotificationReadState,
} from "../repositories/discussionRepository";
import type {
  CreateCommentInput,
  DiscussionContextType,
  SortMode,
  ThreadPage,
} from "../types";
import type { RoleName } from "../../../auth/roles";
import { recordServerBehaviorEvent } from "../../behavior/services/behaviorService";
import { recordAuditLog } from "../../audit/services/auditService";
import { logger } from "../../../utils/logger";

const mentionRegex = /@([a-zA-Z0-9_]{2,64})/g;

const orderThreadElevatedRoles = new Set<RoleName>([
  "REVIEWER",
  "ADMINISTRATOR",
]);

const extractMentionUsernames = (body: string): string[] => {
  const usernames = new Set<string>();
  let match = mentionRegex.exec(body);
  while (match) {
    usernames.add(match[1]);
    match = mentionRegex.exec(body);
  }

  mentionRegex.lastIndex = 0;
  return Array.from(usernames.values());
};

const hasElevatedOrderThreadAccess = (roles: RoleName[]): boolean =>
  roles.some((role) => orderThreadElevatedRoles.has(role));

const assertContextExists = async (params: {
  contextType: DiscussionContextType;
  contextId: number;
}): Promise<void> => {
  if (params.contextType === "LISTING") {
    const exists = await doesListingExist(params.contextId);
    if (!exists) {
      throw new Error("CONTEXT_NOT_FOUND");
    }
  } else if (params.contextType === "ORDER") {
    const exists = await doesOrderExist(params.contextId);
    if (!exists) {
      throw new Error("CONTEXT_NOT_FOUND");
    }
  }
};

const assertDiscussionAccess = async (params: {
  contextType: DiscussionContextType;
  contextId: number;
  userId: number;
  roles: RoleName[];
}): Promise<void> => {
  await assertContextExists({
    contextType: params.contextType,
    contextId: params.contextId,
  });

  if (params.contextType !== "ORDER") {
    return;
  }

  if (hasElevatedOrderThreadAccess(params.roles)) {
    return;
  }

  const isOwner = await isOrderOwnedByUser({
    orderId: params.contextId,
    userId: params.userId,
  });

  if (!isOwner) {
    throw new Error("THREAD_FORBIDDEN");
  }
};

export const createThreadComment = async (params: {
  input: CreateCommentInput;
  userId: number;
  username: string;
  roles: RoleName[];
}) => {
  await assertDiscussionAccess({
    contextType: params.input.contextType,
    contextId: params.input.contextId,
    userId: params.userId,
    roles: params.roles,
  });

  const discussion = await getOrCreateDiscussion({
    contextType: params.input.contextType,
    contextId: params.input.contextId,
    createdByUserId: params.userId,
  });

  if (params.input.parentCommentId) {
    const parent = await findCommentById(params.input.parentCommentId);
    if (!parent || parent.discussionId !== discussion.id) {
      throw new Error("INVALID_PARENT_COMMENT");
    }
  }

  if (params.input.quotedCommentId) {
    const quoted = await findCommentById(params.input.quotedCommentId);
    if (!quoted || quoted.discussionId !== discussion.id) {
      throw new Error("INVALID_QUOTED_COMMENT");
    }
  }

  const created = await createComment({
    discussionId: discussion.id,
    parentCommentId: params.input.parentCommentId,
    quotedCommentId: params.input.quotedCommentId,
    userId: params.userId,
    body: params.input.body,
  });

  const mentionUsernames = extractMentionUsernames(params.input.body);
  const mentionedUsers = await findUsersByUsernames(mentionUsernames);

  const dedupedMentions = mentionedUsers.filter(
    (user) => user.id !== params.userId,
  );

  await createCommentMentions({
    commentId: created.commentId,
    mentions: dedupedMentions.map((mention) => ({
      userId: mention.id,
      username: mention.username,
    })),
  });

  for (const mention of dedupedMentions) {
    await createNotification({
      userId: mention.id,
      notificationType: "MENTION",
      sourceCommentId: created.commentId,
      discussionId: discussion.id,
      message: `${params.username} mentioned you in a discussion.`,
    });
  }

  if (dedupedMentions.length > 0) {
    await recordAuditLog({
      actorUserId: params.userId,
      action: "SHARE",
      resourceType: "DISCUSSION_COMMENT",
      resourceId: created.commentId,
      metadata: {
        discussionId: discussion.id,
        mentionedUserIds: dedupedMentions.map((mention) => mention.id),
      },
    });
  }

  if (params.input.parentCommentId) {
    const parent = await findCommentById(params.input.parentCommentId);
    if (parent && parent.userId !== params.userId) {
      await createNotification({
        userId: parent.userId,
        notificationType: "REPLY",
        sourceCommentId: created.commentId,
        discussionId: discussion.id,
        message: `${params.username} replied to your comment.`,
      });
    }
  }

  logger.info("discussion.comment.created", "New comment posted", {
    discussionId: discussion.id,
    commentId: created.commentId,
    userId: params.userId,
    contextType: params.input.contextType,
    contextId: params.input.contextId,
    hasMentions: dedupedMentions.length > 0,
    isReply: !!params.input.parentCommentId,
  });

  return {
    discussionId: discussion.id,
    commentId: created.commentId,
  };
};

export const getThreadComments = async (params: {
  discussionId: number;
  page: number;
  sort: SortMode;
  userId: number;
  roles: RoleName[];
}): Promise<ThreadPage | null> => {
  const discussion = await getDiscussionById(params.discussionId);
  if (!discussion) {
    return null;
  }

  await assertDiscussionAccess({
    contextType: discussion.contextType,
    contextId: discussion.contextId,
    userId: params.userId,
    roles: params.roles,
  });

  const thread = await getThreadCommentsPage(params);

  await recordServerBehaviorEvent({
    userId: params.userId,
    eventType: "IMPRESSION",
    resourceType: "DISCUSSION_THREAD",
    resourceId: String(params.discussionId),
    metadata: { page: params.page, sort: params.sort },
  });

  return {
    discussionId: discussion.id,
    contextType: discussion.contextType,
    contextId: discussion.contextId,
    page: params.page,
    pageSize: 20,
    total: thread.total,
    comments: thread.comments,
  };
};

export const resolveThreadByContext = async (params: {
  contextType: DiscussionContextType;
  contextId: number;
  userId: number;
  roles: RoleName[];
}) => {
  await assertDiscussionAccess({
    contextType: params.contextType,
    contextId: params.contextId,
    userId: params.userId,
    roles: params.roles,
  });

  const discussion = await getOrCreateDiscussion({
    contextType: params.contextType,
    contextId: params.contextId,
    createdByUserId: params.userId,
  });

  return {
    discussionId: discussion.id,
    contextType: discussion.contextType,
    contextId: discussion.contextId,
  };
};

export const flagComment = async (params: {
  commentId: number;
  flaggedByUserId: number;
  roles: RoleName[];
  reason: string;
}) => {
  const comment = await findCommentById(params.commentId);
  if (!comment) {
    throw new Error("COMMENT_NOT_FOUND");
  }

  if (comment.userId === params.flaggedByUserId) {
    throw new Error("CANNOT_FLAG_OWN_COMMENT");
  }

  const discussion = await getDiscussionById(comment.discussionId);
  if (!discussion) {
    throw new Error("COMMENT_NOT_FOUND");
  }

  await assertDiscussionAccess({
    contextType: discussion.contextType,
    contextId: discussion.contextId,
    userId: params.flaggedByUserId,
    roles: params.roles,
  });

  const hidden = await addCommentFlag({
    commentId: params.commentId,
    flaggedByUserId: params.flaggedByUserId,
    reason: params.reason,
  });

  logger.info("discussion.comment.flagged", "Comment flagged for moderation", {
    discussionId: discussion.id,
    commentId: params.commentId,
    flaggedByUserId: params.flaggedByUserId,
    hidden,
  });

  return {
    commentId: params.commentId,
    hidden,
  };
};

export const listUserNotifications = async (params: {
  userId: number;
  page: number;
}) => {
  return getNotifications(params);
};

export const patchNotificationReadState = async (params: {
  userId: number;
  notificationId: number;
  readState: "READ" | "UNREAD";
}) => {
  return updateNotificationReadState(params);
};

const unhideAllowedRoles = new Set<RoleName>(["REVIEWER", "ADMINISTRATOR"]);

export const unhideComment = async (params: {
  commentId: number;
  actorUserId: number;
  roles: RoleName[];
  reason: string;
}) => {
  if (!params.roles.some((role) => unhideAllowedRoles.has(role))) {
    throw new Error("UNHIDE_FORBIDDEN");
  }

  const comment = await findCommentById(params.commentId);
  if (!comment) {
    throw new Error("COMMENT_NOT_FOUND");
  }

  if (!comment.isHidden) {
    throw new Error("COMMENT_NOT_HIDDEN");
  }

  const unhideReason = `Unhidden by moderator: ${params.reason}`;
  await setCommentVisible({ commentId: params.commentId, reason: unhideReason });

  await recordAuditLog({
    actorUserId: params.actorUserId,
    action: "PERMISSION_CHANGE",
    resourceType: "DISCUSSION_COMMENT",
    resourceId: params.commentId,
    metadata: {
      action: "UNHIDE",
      reason: params.reason,
    },
  });

  logger.info("discussion.comment.unhidden", "Comment unhidden by moderator", {
    commentId: params.commentId,
    actorUserId: params.actorUserId,
  });

  return {
    commentId: params.commentId,
    isHidden: false,
    reason: unhideReason,
  };
};
