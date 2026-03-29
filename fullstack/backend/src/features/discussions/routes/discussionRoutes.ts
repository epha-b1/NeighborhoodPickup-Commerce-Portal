import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/rbac';
import { sendError } from '../../../utils/apiResponse';
import {
  createThreadComment,
  flagComment,
  getThreadComments,
  listUserNotifications,
  patchNotificationReadState
} from '../services/discussionService';

const createCommentSchema = z.object({
  contextType: z.enum(['LISTING', 'ORDER']),
  contextId: z.coerce.number().int().positive(),
  parentCommentId: z.coerce.number().int().positive().optional(),
  quotedCommentId: z.coerce.number().int().positive().optional(),
  body: z.string().trim().min(1).max(5000)
});

const flagSchema = z.object({
  reason: z.string().trim().min(3).max(255)
});

const threadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  sort: z.enum(['newest', 'oldest', 'most_replies']).default('newest')
});

const notificationReadStateSchema = z.object({
  readState: z.enum(['READ', 'UNREAD'])
});

const handleDiscussionError = (error: unknown, response: Response): boolean => {
  if (error instanceof z.ZodError) {
    sendError(
      response,
      400,
      'Invalid request payload.',
      'INVALID_REQUEST_PAYLOAD',
      error.issues
    );
    return true;
  }

  if (error instanceof Error && error.message === 'INVALID_PARENT_COMMENT') {
    sendError(
      response,
      400,
      'Parent comment is invalid for this thread.',
      'INVALID_PARENT_COMMENT'
    );
    return true;
  }

  if (error instanceof Error && error.message === 'INVALID_QUOTED_COMMENT') {
    sendError(
      response,
      400,
      'Quoted comment is invalid for this thread.',
      'INVALID_QUOTED_COMMENT'
    );
    return true;
  }

  if (error instanceof Error && error.message === 'COMMENT_NOT_FOUND') {
    sendError(response, 404, 'Comment not found.', 'COMMENT_NOT_FOUND');
    return true;
  }

  if (error instanceof Error && error.message === 'THREAD_FORBIDDEN') {
    sendError(
      response,
      403,
      'You do not have access to this thread.',
      'THREAD_FORBIDDEN'
    );
    return true;
  }

  return false;
};

export const discussionRouter = Router();

discussionRouter.post('/comments', requireAuth, async (request, response, next) => {
  try {
    const payload = createCommentSchema.parse(request.body);

    const result = await createThreadComment({
      input: payload,
      userId: request.auth!.userId,
      username: request.auth!.username,
      roles: request.auth!.roles
    });

    response.status(201).json(result);
  } catch (error) {
    if (handleDiscussionError(error, response)) {
      return;
    }
    next(error);
  }
});

discussionRouter.get('/threads/:id/comments', requireAuth, async (request, response, next) => {
  try {
    const discussionId = z.coerce.number().int().positive().parse(request.params.id);
    const query = threadQuerySchema.parse(request.query);

    const thread = await getThreadComments({
      discussionId,
      page: query.page,
      sort: query.sort,
      userId: request.auth!.userId,
      roles: request.auth!.roles
    });

    if (!thread) {
      sendError(response, 404, 'Thread not found.', 'THREAD_NOT_FOUND');
      return;
    }

    response.json(thread);
  } catch (error) {
    if (handleDiscussionError(error, response)) {
      return;
    }
    next(error);
  }
});

discussionRouter.post('/comments/:id/flag', requireAuth, async (request, response, next) => {
  try {
    const commentId = z.coerce.number().int().positive().parse(request.params.id);
    const payload = flagSchema.parse(request.body);

    const result = await flagComment({
      commentId,
      flaggedByUserId: request.auth!.userId,
      reason: payload.reason
    });

    response.json(result);
  } catch (error) {
    if (handleDiscussionError(error, response)) {
      return;
    }
    next(error);
  }
});

discussionRouter.get('/notifications', requireAuth, async (request, response, next) => {
  try {
    const page = z.coerce.number().int().min(1).default(1).parse(request.query.page);
    const result = await listUserNotifications({
      userId: request.auth!.userId,
      page
    });

    response.json({
      page,
      pageSize: 20,
      total: result.total,
      data: result.notifications
    });
  } catch (error) {
    if (handleDiscussionError(error, response)) {
      return;
    }
    next(error);
  }
});

discussionRouter.patch('/notifications/:id/read-state', requireAuth, async (request, response, next) => {
  try {
    const notificationId = z.coerce.number().int().positive().parse(request.params.id);
    const payload = notificationReadStateSchema.parse(request.body);

    const updated = await patchNotificationReadState({
      userId: request.auth!.userId,
      notificationId,
      readState: payload.readState
    });

    if (!updated) {
      sendError(response, 404, 'Notification not found.', 'NOTIFICATION_NOT_FOUND');
      return;
    }

    response.json({
      notificationId,
      readState: payload.readState
    });
  } catch (error) {
    if (handleDiscussionError(error, response)) {
      return;
    }
    next(error);
  }
});
