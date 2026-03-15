import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, getAccessibleProjectIds, requireProjectAccess } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

const taskCreateInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']).optional(),
  projectId: z.string().optional(),
  sectionId: z.string().optional(),
  assigneeId: z.string().optional(),
  parentId: z.string().optional(),
  dueDate: z.date().optional(),
  labelIds: z.array(z.string()).optional(),
  workspaceId: z.string(),
});

const taskUpdateInput = z.object({
  id: z.string(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']).optional(),
  projectId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.date().nullable().optional(),
  labelIds: z.array(z.string()).optional(),
});

const taskListInput = z.object({
  workspaceId: z.string(),
  projectId: z.string().optional(),
  status: z.array(z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'])).optional(),
  priority: z.array(z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'])).optional(),
  assigneeId: z.array(z.string()).optional(),
  labelId: z.array(z.string()).optional(),
  isBlocked: z.boolean().optional(),
  sortField: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'title']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(200).optional(),
});

const taskIncludes = {
  assignee: true,
  createdBy: true,
  labels: { include: { label: true } },
  project: true,
  collaborators: { include: { user: true } },
  attachments: { include: { uploadedBy: true }, orderBy: { createdAt: 'asc' as const } },
  subtasks: {
    include: { assignee: true, labels: { include: { label: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  blocking: {
    include: { blockedTask: { select: { id: true, identifier: true, title: true, status: true } } },
  },
  blockedBy: {
    include: { blockingTask: { select: { id: true, identifier: true, title: true, status: true } } },
  },
  githubPRs: { orderBy: { createdAt: 'desc' as const } },
  _count: { select: { comments: true } },
} as const;

export const tasksRouter = router({
  create: protectedProcedure
    .input(taskCreateInput)
    .mutation(async ({ ctx, input }) => {
      const { labelIds, workspaceId, ...taskData } = input;

      const membership = await requireWorkspaceMember(ctx.db, workspaceId, ctx.userId);

      // Guests must specify a project and have access to it
      if (membership.role === 'GUEST') {
        if (!input.projectId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Guests must assign tasks to a project.' });
        }
        await requireProjectAccess(ctx.db, input.projectId, ctx.userId);
      }

      // Atomic identifier generation
      const workspace = await ctx.db.workspace.update({
        where: { id: workspaceId },
        data: { taskCounter: { increment: 1 } },
      });

      const identifier = `HM-${workspace.taskCounter}`;

      const task = await ctx.db.task.create({
        data: {
          ...taskData,
          workspaceId,
          identifier,
          createdById: ctx.userId,
          labels: labelIds?.length
            ? { create: labelIds.map((labelId: string) => ({ labelId })) }
            : undefined,
        },
        include: taskIncludes,
      });

      // Create activity
      await ctx.db.activity.create({
        data: {
          taskId: task.id,
          userId: ctx.userId,
          action: 'created',
        },
      });

      // Notify assignee
      if (task.assigneeId && task.assigneeId !== ctx.userId) {
        await ctx.db.notification.create({
          data: {
            userId: task.assigneeId,
            type: 'ASSIGNED',
            taskId: task.id,
            actorId: ctx.userId,
            message: `assigned you to ${task.identifier} ${task.title}`,
          },
        });
      }

      return task;
    }),

  list: protectedProcedure
    .input(taskListInput)
    .query(async ({ ctx, input }) => {
      await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {};

      where.workspaceId = input.workspaceId;

      // Scope guests to their accessible projects
      const accessibleIds = await getAccessibleProjectIds(ctx.db, input.workspaceId, ctx.userId);
      if (accessibleIds !== null) {
        // Guest: constrain to accessible projects (and validate if specific project requested)
        if (input.projectId) {
          if (!accessibleIds.includes(input.projectId)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this project' });
          }
          where.projectId = input.projectId;
        } else {
          where.projectId = { in: accessibleIds };
        }
      } else if (input.projectId) {
        where.projectId = input.projectId;
      }

      if (input.status?.length) {
        where.status = { in: input.status };
      } else {
        where.status = { not: 'CANCELLED' };
      }

      if (input.priority?.length) {
        where.priority = { in: input.priority };
      }

      if (input.assigneeId?.length) {
        where.assigneeId = { in: input.assigneeId };
      }

      if (input.labelId?.length) {
        where.labels = { some: { labelId: { in: input.labelId } } };
      }

      if (input.isBlocked === true) {
        where.blockedBy = {
          some: { blockingTask: { status: { notIn: ['DONE', 'CANCELLED'] } } },
        };
      } else if (input.isBlocked === false) {
        where.NOT = {
          blockedBy: { some: { blockingTask: { status: { notIn: ['DONE', 'CANCELLED'] } } } },
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orderBy: any = {};
      if (input.sortField) {
        orderBy[input.sortField] = input.sortDirection || 'asc';
      } else {
        orderBy.createdAt = 'desc';
      }

      const tasks = await ctx.db.task.findMany({
        where,
        orderBy,
        take: (input.limit || 100) + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: taskIncludes,
      });

      let nextCursor: string | undefined;
      if (tasks.length > (input.limit || 100)) {
        const nextItem = tasks.pop();
        nextCursor = nextItem?.id;
      }

      return { tasks, nextCursor };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({
        where: { id: input.id },
        include: {
          assignee: true,
          createdBy: true,
          labels: { include: { label: true } },
          project: true,
          collaborators: { include: { user: true } },
          attachments: { include: { uploadedBy: true }, orderBy: { createdAt: 'asc' as const } },
          subtasks: {
            include: { assignee: true, labels: { include: { label: true } } },
            orderBy: { createdAt: 'asc' as const },
          },
          comments: {
            include: { author: true },
            orderBy: { createdAt: 'asc' },
          },
          blocking: {
            include: { blockedTask: { select: { id: true, identifier: true, title: true, status: true } } },
          },
          blockedBy: {
            include: { blockingTask: { select: { id: true, identifier: true, title: true, status: true } } },
          },
          activities: {
            include: { user: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
          githubPRs: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }

      const membership = await requireWorkspaceMember(ctx.db, task.workspaceId, ctx.userId);

      // Guests can only see tasks in their accessible projects
      if (membership.role === 'GUEST') {
        if (!task.projectId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this task' });
        }
        await requireProjectAccess(ctx.db, task.projectId, ctx.userId);
      }

      return task;
    }),

  update: protectedProcedure
    .input(taskUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const { id, labelIds, ...data } = input;

      const existing = await ctx.db.task.findUnique({
        where: { id },
        include: { labels: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }

      const membership = await requireWorkspaceMember(ctx.db, existing.workspaceId, ctx.userId);

      // Guests: verify access to current project and target project (if moving)
      if (membership.role === 'GUEST') {
        if (existing.projectId) {
          await requireProjectAccess(ctx.db, existing.projectId, ctx.userId);
        } else {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this task' });
        }
        if (data.projectId && data.projectId !== existing.projectId) {
          await requireProjectAccess(ctx.db, data.projectId, ctx.userId);
        }
      }

      // Track changes for activity log
      const activities: { field: string; oldValue: string | null; newValue: string | null; action: string }[] = [];

      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          const oldVal = (existing as Record<string, unknown>)[key];
          const oldStr = oldVal instanceof Date ? oldVal.toISOString() : String(oldVal ?? '');
          const newStr = value instanceof Date ? value.toISOString() : String(value ?? '');
          if (oldStr !== newStr) {
            activities.push({
              field: key,
              oldValue: oldStr || null,
              newValue: newStr || null,
              action: `${key}_changed`,
            });
          }
        }
      }

      // Update labels if provided
      if (labelIds !== undefined) {
        await ctx.db.taskLabel.deleteMany({ where: { taskId: id } });
        if (labelIds.length > 0) {
          await ctx.db.taskLabel.createMany({
            data: labelIds.map((labelId: string) => ({ taskId: id, labelId })),
          });
        }
      }

      const updated = await ctx.db.task.update({
        where: { id },
        data,
        include: taskIncludes,
      });

      // Create activity records
      for (const activity of activities) {
        await ctx.db.activity.create({
          data: {
            taskId: id,
            userId: ctx.userId,
            ...activity,
          },
        });
      }

      // Notify on assignment change
      if (data.assigneeId && data.assigneeId !== existing.assigneeId && data.assigneeId !== ctx.userId) {
        await ctx.db.notification.create({
          data: {
            userId: data.assigneeId,
            type: 'ASSIGNED',
            taskId: id,
            actorId: ctx.userId,
            message: `assigned you to ${updated.identifier} ${updated.title}`,
          },
        });
      }

      // Notify blocked tasks when status moves to DONE
      if (data.status === 'DONE' && existing.status !== 'DONE') {
        const blockedDeps = await ctx.db.dependency.findMany({
          where: { blockingTaskId: id },
          include: { blockedTask: true },
        });

        for (const dep of blockedDeps) {
          if (dep.blockedTask.assigneeId && dep.blockedTask.assigneeId !== ctx.userId) {
            await ctx.db.notification.create({
              data: {
                userId: dep.blockedTask.assigneeId,
                type: 'DEPENDENCY_RESOLVED',
                taskId: dep.blockedTaskId,
                actorId: ctx.userId,
                message: `resolved blocker ${updated.identifier} for ${dep.blockedTask.identifier}`,
              },
            });
          }
        }
      }

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({
        where: { id: input.id },
        select: { workspaceId: true, projectId: true },
      });

      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }

      const membership = await requireWorkspaceMember(ctx.db, task.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        if (!task.projectId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this task' });
        }
        await requireProjectAccess(ctx.db, task.projectId, ctx.userId);
      }

      return ctx.db.task.update({
        where: { id: input.id },
        data: { status: 'CANCELLED' },
      });
    }),

  addCollaborator: protectedProcedure
    .input(z.object({ taskId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({
        where: { id: input.taskId },
        select: { workspaceId: true },
      });

      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }

      await requireWorkspaceMember(ctx.db, task.workspaceId, ctx.userId);

      return ctx.db.taskCollaborator.upsert({
        where: { taskId_userId: { taskId: input.taskId, userId: input.userId } },
        create: { taskId: input.taskId, userId: input.userId },
        update: {},
      });
    }),

  removeCollaborator: protectedProcedure
    .input(z.object({ taskId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({
        where: { id: input.taskId },
        select: { workspaceId: true },
      });

      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }

      await requireWorkspaceMember(ctx.db, task.workspaceId, ctx.userId);

      return ctx.db.taskCollaborator.delete({
        where: { taskId_userId: { taskId: input.taskId, userId: input.userId } },
      });
    }),

  addAttachment: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      name: z.string(),
      url: z.string(),
      size: z.number().optional(),
      mimeType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({
        where: { id: input.taskId },
        select: { workspaceId: true },
      });

      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }

      await requireWorkspaceMember(ctx.db, task.workspaceId, ctx.userId);

      return ctx.db.taskAttachment.create({
        data: { ...input, uploadedById: ctx.userId },
        include: { uploadedBy: true },
      });
    }),

  deleteAttachment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const attachment = await ctx.db.taskAttachment.findUnique({
        where: { id: input.id },
        include: { task: { select: { workspaceId: true } } },
      });

      if (!attachment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Attachment not found' });
      }

      await requireWorkspaceMember(ctx.db, attachment.task.workspaceId, ctx.userId);

      return ctx.db.taskAttachment.delete({ where: { id: input.id } });
    }),
});
