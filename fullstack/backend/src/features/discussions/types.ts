export type DiscussionContextType = 'LISTING' | 'ORDER';
export type SortMode = 'newest' | 'oldest' | 'most_replies';

export type CreateCommentInput = {
  contextType: DiscussionContextType;
  contextId: number;
  parentCommentId?: number;
  quotedCommentId?: number;
  body: string;
};

export type ThreadComment = {
  id: number;
  discussionId: number;
  parentCommentId: number | null;
  userId: number;
  username: string;
  body: string;
  quotedCommentId: number | null;
  quotedBody: string | null;
  isHidden: boolean;
  hiddenReason: string | null;
  replyCount: number;
  flagCount: number;
  createdAt: string;
  mentions: Array<{ userId: number; username: string }>;
};

export type ThreadPage = {
  discussionId: number;
  contextType: DiscussionContextType;
  contextId: number;
  page: number;
  pageSize: 20;
  total: number;
  comments: ThreadComment[];
};

export type NotificationItem = {
  id: number;
  notificationType: 'MENTION' | 'REPLY';
  sourceCommentId: number;
  discussionId: number;
  message: string;
  readState: 'UNREAD' | 'READ';
  createdAt: string;
  readAt: string | null;
};