import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, getAccessibleProjectIds, requireProjectAccess } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { Prisma, FeedbackStatus, FeedbackType, Priority } from '@/generated/prisma/client';

const feedbackIncludes = {
  createdBy: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
  project: { select: { id: true, name: true, color: true } },
} as const;

export const feedbackRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        status: z.nativeEnum(FeedbackStatus).optional(),
        type: z.nativeEnum(FeedbackType).optional(),
        priority: z.nativeEnum(Priority).optional(),
        assigneeId: z.string().optional(),
        projectId: z.string().optional(),
        search: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const { workspaceId, status, type, priority, assigneeId, projectId, search, cursor, limit } = input;

      await requireWorkspaceMember(ctx.db, workspaceId, ctx.userId);

      const where: Prisma.FeedbackWhereInput = { workspaceId };

      // Guest scoping
      const accessibleIds = await getAccessibleProjectIds(ctx.db, workspaceId, ctx.userId);
      if (accessibleIds !== null) {
        if (projectId) {
          if (!accessibleIds.includes(projectId)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this project' });
          }
          where.projectId = projectId;
        } else {
          where.OR = [
            { projectId: { in: accessibleIds } },
            { projectId: null },
          ];
        }
      } else if (projectId) {
        where.projectId = projectId;
      }

      if (status) where.status = status;
      if (type) where.type = type;
      if (priority) where.priority = priority;
      if (assigneeId) where.assigneeId = assigneeId;
      if (search && search.trim()) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          {
            OR: [
              { title: { contains: search.trim(), mode: 'insensitive' } },
              { description: { contains: search.trim(), mode: 'insensitive' } },
              { identifier: { contains: search.trim(), mode: 'insensitive' } },
            ],
          },
        ];
      }

      const items = await ctx.db.feedback.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: feedbackIncludes,
      });

      let nextCursor: string | null = null;
      if (items.length > limit) {
        const next = items.pop();
        nextCursor = next!.id;
      }

      return { items, nextCursor };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const feedback = await ctx.db.feedback.findUnique({
        where: { id: input.id },
        include: feedbackIncludes,
      });

      if (!feedback) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feedback not found' });
      }

      const membership = await requireWorkspaceMember(ctx.db, feedback.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        if (!feedback.projectId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this feedback' });
        }
        await requireProjectAccess(ctx.db, feedback.projectId, ctx.userId);
      }

      return feedback;
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        title: z.string().min(1).max(500),
        description: z.string().default(''),
        type: z.nativeEnum(FeedbackType).default('OTHER'),
        priority: z.nativeEnum(Priority).default('NONE'),
        projectId: z.string().optional(),
        assigneeId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Guests cannot submit feedback.' });
      }

      return ctx.db.$transaction(async (tx) => {
        const workspace = await tx.workspace.update({
          where: { id: input.workspaceId },
          data: { feedbackCounter: { increment: 1 } },
        });

        const identifier = `FB-${String(workspace.feedbackCounter).padStart(3, '0')}`;

        return tx.feedback.create({
          data: {
            identifier,
            workspaceId: input.workspaceId,
            createdById: ctx.userId,
            title: input.title,
            description: input.description,
            type: input.type,
            priority: input.priority,
            projectId: input.projectId ?? null,
            assigneeId: input.assigneeId ?? null,
          },
          include: feedbackIncludes,
        });
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(500).optional(),
        description: z.string().optional(),
        type: z.nativeEnum(FeedbackType).optional(),
        status: z.nativeEnum(FeedbackStatus).optional(),
        priority: z.nativeEnum(Priority).optional(),
        projectId: z.string().nullable().optional(),
        assigneeId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const feedback = await ctx.db.feedback.findUniqueOrThrow({ where: { id: input.id } });

      const membership = await requireWorkspaceMember(ctx.db, feedback.workspaceId, ctx.userId);

      if (feedback.createdById !== ctx.userId && membership.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the creator or an admin can edit this feedback.' });
      }

      const { id, ...data } = input;

      return ctx.db.feedback.update({
        where: { id },
        data,
        include: feedbackIncludes,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const feedback = await ctx.db.feedback.findUniqueOrThrow({ where: { id: input.id } });

      const membership = await requireWorkspaceMember(ctx.db, feedback.workspaceId, ctx.userId);

      if (feedback.createdById !== ctx.userId && membership.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the creator or an admin can delete this feedback.' });
      }

      await ctx.db.feedback.delete({ where: { id: input.id } });
    }),

  getStats: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      const [statusCounts, totalCount] = await Promise.all([
        ctx.db.feedback.groupBy({
          by: ['status'],
          where: { workspaceId: input.workspaceId },
          _count: true,
        }),
        ctx.db.feedback.count({
          where: { workspaceId: input.workspaceId },
        }),
      ]);

      return {
        byStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
        totalCount,
      };
    }),
});
