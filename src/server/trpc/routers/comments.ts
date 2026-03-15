import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, requireProjectAccess } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

export const commentsRouter = router({
  list: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({
        where: { id: input.taskId },
        select: { workspaceId: true, projectId: true },
      });

      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }

      const membership = await requireWorkspaceMember(ctx.db, task.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        if (!task.projectId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this task' });
        await requireProjectAccess(ctx.db, task.projectId, ctx.userId);
      }

      return ctx.db.comment.findMany({
        where: { taskId: input.taskId },
        include: { author: true },
        orderBy: { createdAt: 'asc' },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        body: z.string().min(1),
        attachments: z.array(z.object({
          name: z.string(),
          url: z.string().url(),
          size: z.number().optional(),
          mimeType: z.string().optional(),
        })).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({
        where: { id: input.taskId },
        select: { id: true, identifier: true, title: true, assigneeId: true, createdById: true, workspaceId: true, projectId: true },
      });

      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });

      const membership = await requireWorkspaceMember(ctx.db, task.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        if (!task.projectId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this task' });
        await requireProjectAccess(ctx.db, task.projectId, ctx.userId);
      }

      const comment = await ctx.db.comment.create({
        data: {
          taskId: input.taskId,
          authorId: ctx.userId,
          body: input.body,
          attachments: input.attachments ?? undefined,
        },
        include: { author: true },
      });

      // Parse @mentions from body: @[Name](userId)
      const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      const mentionedUserIds = new Set<string>();
      while ((match = mentionRegex.exec(input.body)) !== null) {
        mentionedUserIds.add(match[2]);
      }

      // Notify mentioned users
      const notifications = [];
      for (const mentionedId of mentionedUserIds) {
        if (mentionedId !== ctx.userId) {
          notifications.push({
            userId: mentionedId,
            type: 'MENTIONED' as const,
            taskId: input.taskId,
            commentId: comment.id,
            actorId: ctx.userId,
            message: `mentioned you in ${task.identifier} ${task.title}`,
          });
        }
      }

      // Notify task assignee (if not author and not already mentioned)
      if (task.assigneeId && task.assigneeId !== ctx.userId && !mentionedUserIds.has(task.assigneeId)) {
        notifications.push({
          userId: task.assigneeId,
          type: 'COMMENT' as const,
          taskId: input.taskId,
          commentId: comment.id,
          actorId: ctx.userId,
          message: `commented on ${task.identifier} ${task.title}`,
        });
      }

      // Notify task creator (if not author, not assignee, and not mentioned)
      if (
        task.createdById !== ctx.userId &&
        task.createdById !== task.assigneeId &&
        !mentionedUserIds.has(task.createdById)
      ) {
        notifications.push({
          userId: task.createdById,
          type: 'COMMENT' as const,
          taskId: input.taskId,
          commentId: comment.id,
          actorId: ctx.userId,
          message: `commented on ${task.identifier} ${task.title}`,
        });
      }

      if (notifications.length > 0) {
        await ctx.db.notification.createMany({ data: notifications });
      }

      return comment;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.comment.findUnique({
        where: { id: input.id },
        select: { authorId: true },
      });

      if (!comment || comment.authorId !== ctx.userId) {
        throw new Error('Not authorized to delete this comment');
      }

      return ctx.db.comment.delete({ where: { id: input.id } });
    }),

  addReaction: protectedProcedure
    .input(z.object({ commentId: z.string(), emoji: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.comment.findUnique({
        where: { id: input.commentId },
        select: { reactions: true, task: { select: { workspaceId: true, projectId: true } } },
      });

      if (!comment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found' });

      const membership = await requireWorkspaceMember(ctx.db, comment.task.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        if (!comment.task.projectId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this task' });
        await requireProjectAccess(ctx.db, comment.task.projectId, ctx.userId);
      }

      const reactions = (comment.reactions as Array<{ emoji: string; userIds: string[] }>) || [];
      const existing = reactions.find((r) => r.emoji === input.emoji);

      if (existing) {
        if (existing.userIds.includes(ctx.userId)) {
          existing.userIds = existing.userIds.filter((id) => id !== ctx.userId);
          if (existing.userIds.length === 0) {
            reactions.splice(reactions.indexOf(existing), 1);
          }
        } else {
          existing.userIds.push(ctx.userId);
        }
      } else {
        reactions.push({ emoji: input.emoji, userIds: [ctx.userId] });
      }

      return ctx.db.comment.update({
        where: { id: input.commentId },
        data: { reactions },
        include: { author: true },
      });
    }),
});
