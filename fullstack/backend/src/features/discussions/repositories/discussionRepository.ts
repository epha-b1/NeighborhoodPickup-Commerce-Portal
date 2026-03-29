import { dbPool } from '../../../db/pool';
import type { DiscussionContextType, NotificationItem, SortMode, ThreadComment } from '../types';

const discussionSortSql: Record<SortMode, string> = {
  newest: 'c.created_at DESC',
  oldest: 'c.created_at ASC',
  most_replies: 'c.reply_count DESC, c.created_at DESC'
};

export const getOrCreateDiscussion = async (params: {
  contextType: DiscussionContextType;
  contextId: number;
  createdByUserId: number;
}): Promise<{ id: number; contextType: DiscussionContextType; contextId: number }> => {
  const [rows] = await dbPool.query<
    { id: number; context_type: DiscussionContextType; context_id: number }[]
  >(
    `SELECT id, context_type, context_id
     FROM discussions
     WHERE context_type = ? AND context_id = ?
     LIMIT 1`,
    [params.contextType, params.contextId]
  );

  if (rows.length > 0) {
    return {
      id: rows[0].id,
      contextType: rows[0].context_type,
      contextId: rows[0].context_id
    };
  }

  const [insertResult] = await dbPool.query<any>(
    `INSERT INTO discussions (context_type, context_id, created_by_user_id)
     VALUES (?, ?, ?)`,
    [params.contextType, params.contextId, params.createdByUserId]
  );

  return {
    id: Number(insertResult.insertId),
    contextType: params.contextType,
    contextId: params.contextId
  };
};

export const createComment = async (params: {
  discussionId: number;
  parentCommentId?: number;
  quotedCommentId?: number;
  userId: number;
  body: string;
}): Promise<{ commentId: number }> => {
  const [result] = await dbPool.query<any>(
    `INSERT INTO comments
      (discussion_id, parent_comment_id, user_id, body, quoted_comment_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.discussionId,
      params.parentCommentId ?? null,
      params.userId,
      params.body,
      params.quotedCommentId ?? null
    ]
  );

  const commentId = Number(result.insertId);

  if (params.parentCommentId) {
    await dbPool.query(
      `UPDATE comments
       SET reply_count = reply_count + 1
       WHERE id = ?`,
      [params.parentCommentId]
    );
  }

  return { commentId };
};

export const findCommentById = async (commentId: number): Promise<{
  id: number;
  discussionId: number;
  parentCommentId: number | null;
  userId: number;
  body: string;
  isHidden: boolean;
  hiddenReason: string | null;
} | null> => {
  const [rows] = await dbPool.query<
    {
      id: number;
      discussion_id: number;
      parent_comment_id: number | null;
      user_id: number;
      body: string;
      is_hidden: number;
      hidden_reason: string | null;
    }[]
  >(
    `SELECT id, discussion_id, parent_comment_id, user_id, body, is_hidden, hidden_reason
     FROM comments
     WHERE id = ?
     LIMIT 1`,
    [commentId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    discussionId: row.discussion_id,
    parentCommentId: row.parent_comment_id,
    userId: row.user_id,
    body: row.body,
    isHidden: row.is_hidden === 1,
    hiddenReason: row.hidden_reason
  };
};

export const findUsersByUsernames = async (usernames: string[]): Promise<Array<{ id: number; username: string }>> => {
  if (usernames.length === 0) {
    return [];
  }

  const placeholders = usernames.map(() => '?').join(',');
  const [rows] = await dbPool.query<{ id: number; username: string }[]>(
    `SELECT id, username FROM users WHERE username IN (${placeholders})`,
    usernames
  );
  return rows;
};

export const createCommentMentions = async (params: {
  commentId: number;
  mentions: Array<{ userId: number; username: string }>;
}): Promise<void> => {
  for (const mention of params.mentions) {
    await dbPool.query(
      `INSERT IGNORE INTO comment_mentions (comment_id, mentioned_user_id, mention_text)
       VALUES (?, ?, ?)`,
      [params.commentId, mention.userId, `@${mention.username}`]
    );
  }
};

export const createNotification = async (params: {
  userId: number;
  notificationType: 'MENTION' | 'REPLY';
  sourceCommentId: number;
  discussionId: number;
  message: string;
}): Promise<void> => {
  await dbPool.query(
    `INSERT INTO notifications
      (user_id, notification_type, source_comment_id, discussion_id, message, read_state)
     VALUES (?, ?, ?, ?, ?, 'UNREAD')`,
    [
      params.userId,
      params.notificationType,
      params.sourceCommentId,
      params.discussionId,
      params.message
    ]
  );
};

export const getThreadCommentsPage = async (params: {
  discussionId: number;
  page: number;
  sort: SortMode;
}): Promise<{ total: number; comments: ThreadComment[] }> => {
  const pageSize = 20;
  const offset = (params.page - 1) * pageSize;

  const [countRows] = await dbPool.query<{ total: number }[]>(
    `SELECT COUNT(*) AS total
     FROM comments
     WHERE discussion_id = ?`,
    [params.discussionId]
  );

  const [rows] = await dbPool.query<
    {
      id: number;
      discussion_id: number;
      parent_comment_id: number | null;
      user_id: number;
      username: string;
      body: string;
      quoted_comment_id: number | null;
      quoted_body: string | null;
      is_hidden: number;
      hidden_reason: string | null;
      reply_count: number;
      created_at: Date | string;
      flag_count: number;
    }[]
  >(
    `SELECT c.id,
            c.discussion_id,
            c.parent_comment_id,
            c.user_id,
            u.username,
            c.body,
            c.quoted_comment_id,
            qc.body AS quoted_body,
            c.is_hidden,
            c.hidden_reason,
            c.reply_count,
            c.created_at,
            (SELECT COUNT(*) FROM comment_flags cf WHERE cf.comment_id = c.id) AS flag_count
     FROM comments c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN comments qc ON qc.id = c.quoted_comment_id
     WHERE c.discussion_id = ?
     ORDER BY ${discussionSortSql[params.sort]}
     LIMIT ? OFFSET ?`,
    [params.discussionId, pageSize, offset]
  );

  const commentIds = rows.map((row) => row.id);
  const mentionsByComment = new Map<number, Array<{ userId: number; username: string }>>();

  if (commentIds.length > 0) {
    const placeholders = commentIds.map(() => '?').join(',');
    const [mentionRows] = await dbPool.query<
      { comment_id: number; mentioned_user_id: number; username: string }[]
    >(
      `SELECT cm.comment_id, cm.mentioned_user_id, u.username
       FROM comment_mentions cm
       JOIN users u ON u.id = cm.mentioned_user_id
       WHERE cm.comment_id IN (${placeholders})`,
      commentIds
    );

    for (const mention of mentionRows) {
      const list = mentionsByComment.get(mention.comment_id) ?? [];
      list.push({ userId: mention.mentioned_user_id, username: mention.username });
      mentionsByComment.set(mention.comment_id, list);
    }
  }

  return {
    total: Number(countRows[0]?.total ?? 0),
    comments: rows.map((row) => ({
      id: row.id,
      discussionId: row.discussion_id,
      parentCommentId: row.parent_comment_id,
      userId: row.user_id,
      username: row.username,
      body: row.body,
      quotedCommentId: row.quoted_comment_id,
      quotedBody: row.quoted_body,
      isHidden: row.is_hidden === 1,
      hiddenReason: row.hidden_reason,
      replyCount: Number(row.reply_count),
      flagCount: Number(row.flag_count),
      createdAt: new Date(row.created_at).toISOString(),
      mentions: mentionsByComment.get(row.id) ?? []
    }))
  };
};

export const getDiscussionById = async (discussionId: number): Promise<{
  id: number;
  contextType: DiscussionContextType;
  contextId: number;
} | null> => {
  const [rows] = await dbPool.query<
    { id: number; context_type: DiscussionContextType; context_id: number }[]
  >(
    `SELECT id, context_type, context_id
     FROM discussions
     WHERE id = ?
     LIMIT 1`,
    [discussionId]
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    id: rows[0].id,
    contextType: rows[0].context_type,
    contextId: rows[0].context_id
  };
};

export const isOrderOwnedByUser = async (params: {
  orderId: number;
  userId: number;
}): Promise<boolean> => {
  const [rows] = await dbPool.query<{ id: number }[]>(
    `SELECT id
     FROM orders
     WHERE id = ?
       AND user_id = ?
     LIMIT 1`,
    [params.orderId, params.userId]
  );

  return rows.length > 0;
};

export const addCommentFlag = async (params: {
  commentId: number;
  flaggedByUserId: number;
  reason: string;
}): Promise<void> => {
  await dbPool.query(
    `INSERT IGNORE INTO comment_flags (comment_id, flagged_by_user_id, reason)
     VALUES (?, ?, ?)`,
    [params.commentId, params.flaggedByUserId, params.reason]
  );

  const [countRows] = await dbPool.query<{ total: number }[]>(
    `SELECT COUNT(*) AS total
     FROM comment_flags
     WHERE comment_id = ?`,
    [params.commentId]
  );

  if (Number(countRows[0]?.total ?? 0) >= 1) {
    await dbPool.query(
      `UPDATE comments
       SET is_hidden = 1,
           hidden_reason = 'Flagged by community moderation'
       WHERE id = ?`,
      [params.commentId]
    );
  }
};

export const getNotifications = async (params: {
  userId: number;
  page: number;
}): Promise<{ total: number; notifications: NotificationItem[] }> => {
  const pageSize = 20;
  const offset = (params.page - 1) * pageSize;

  const [countRows] = await dbPool.query<{ total: number }[]>(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?',
    [params.userId]
  );

  const [rows] = await dbPool.query<
    {
      id: number;
      notification_type: 'MENTION' | 'REPLY';
      source_comment_id: number;
      discussion_id: number;
      message: string;
      read_state: 'UNREAD' | 'READ';
      created_at: Date | string;
      read_at: Date | string | null;
    }[]
  >(
    `SELECT id,
            notification_type,
            source_comment_id,
            discussion_id,
            message,
            read_state,
            created_at,
            read_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [params.userId, pageSize, offset]
  );

  return {
    total: Number(countRows[0]?.total ?? 0),
    notifications: rows.map((row) => ({
      id: row.id,
      notificationType: row.notification_type,
      sourceCommentId: row.source_comment_id,
      discussionId: row.discussion_id,
      message: row.message,
      readState: row.read_state,
      createdAt: new Date(row.created_at).toISOString(),
      readAt: row.read_at ? new Date(row.read_at).toISOString() : null
    }))
  };
};

export const updateNotificationReadState = async (params: {
  userId: number;
  notificationId: number;
  readState: 'READ' | 'UNREAD';
}): Promise<boolean> => {
  const [result] = await dbPool.query<any>(
    `UPDATE notifications
     SET read_state = ?,
         read_at = CASE WHEN ? = 'READ' THEN CURRENT_TIMESTAMP ELSE NULL END
     WHERE id = ?
       AND user_id = ?`,
    [params.readState, params.readState, params.notificationId, params.userId]
  );

  return Number(result.affectedRows ?? 0) > 0;
};