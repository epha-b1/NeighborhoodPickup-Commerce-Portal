import { apiRequest } from './client';
import type { NotificationsResponse, ThreadResponse } from '../types/discussion';

export const discussionApi = {
  createComment: (payload: {
    contextType: 'LISTING' | 'ORDER';
    contextId: number;
    parentCommentId?: number;
    quotedCommentId?: number;
    body: string;
  }) =>
    apiRequest<{ discussionId: number; commentId: number }>('/comments', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getThreadComments: (params: { discussionId: number; page: number; sort: 'newest' | 'oldest' | 'most_replies' }) => {
    const query = new URLSearchParams({
      page: String(params.page),
      sort: params.sort
    });

    return apiRequest<ThreadResponse>(`/threads/${params.discussionId}/comments?${query.toString()}`);
  },
  flagComment: (commentId: number, reason: string) =>
    apiRequest<{ commentId: number; hidden: boolean }>(`/comments/${commentId}/flag`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),
  getNotifications: (page = 1) =>
    apiRequest<NotificationsResponse>(`/notifications?page=${page}`),
  setNotificationReadState: (notificationId: number, readState: 'READ' | 'UNREAD') =>
    apiRequest<{ notificationId: number; readState: 'READ' | 'UNREAD' }>(
      `/notifications/${notificationId}/read-state`,
      {
        method: 'PATCH',
        body: JSON.stringify({ readState })
      }
    )
};