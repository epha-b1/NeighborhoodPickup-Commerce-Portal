import {
  addCommentFlag,
  createComment,
  createCommentMentions,
  createNotification,
  findCommentById,
  findUsersByUsernames,
  getDiscussionById,
  getNotifications,
  getOrCreateDiscussion,
  getThreadCommentsPage,
  isOrderOwnedByUser,
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

const mentionRegex = /@([a-zA-Z0-9_]{2,64})/g;

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

const hasPrivilegedDiscussionAccess = (roles: RoleName[]): boolean =>
  roles.some((role) => role !== "MEMBER");

const assertDiscussionAccess = async (params: {
  contextType: DiscussionContextType;
  contextId: number;
  userId: number;
  roles: RoleName[];
}): Promise<void> => {
  if (params.contextType !== "ORDER") {
    return;
  }

  if (hasPrivilegedDiscussionAccess(params.roles)) {
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

export const flagComment = async (params: {
  commentId: number;
  flaggedByUserId: number;
  reason: string;
}) => {
  const comment = await findCommentById(params.commentId);
  if (!comment) {
    throw new Error("COMMENT_NOT_FOUND");
  }

  await addCommentFlag(params);

  return {
    commentId: params.commentId,
    hidden: true,
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
