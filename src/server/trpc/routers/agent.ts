import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, requireWorkspaceAdmin } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { applyInsightAction, revertInsightAction, runPeriodicAnalysis } from '@/server/ai/agent-engine';

export const agentRouter = router({
  getInsights: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        type: z.enum([
          'STALE_TASK', 'OVERDUE_ESCALATION', 'DEPENDENCY_UNBLOCKED',
          'WORKLOAD_IMBALANCE', 'PROJECT_HEALTH_ALERT', 'DUPLICATE_DETECTED',
          'DECOMPOSITION_SUGGESTED', 'MEETING_ACTION_ITEMS', 'DAILY_DIGEST',
        ]).optional(),
        status: z.enum(['PENDING', 'ACCEPTED', 'DISMISSED', 'AUTO_APPLIED', 'REVERTED', 'EXPIRED']).optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {
        workspaceId: input.workspaceId,
        targetUserId: ctx.userId,
      };

      if (input.type) where.type = input.type;
      if (input.status) {
        where.status = input.status;
      } else {
        where.status = 'PENDING';
      }

      // Don't show expired insights
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ];

      const insights = await ctx.db.agentInsight.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: (input.limit || 20) + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          task: { select: { id: true, identifier: true, title: true, status: true } },
        },
      });

      let nextCursor: string | undefined;
      if (insights.length > (input.limit || 20)) {
        const nextItem = insights.pop();
        nextCursor = nextItem?.id;
      }

      return { insights, nextCursor };
    }),

  pendingCount: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      return ctx.db.agentInsight.count({
        where: {
          workspaceId: input.workspaceId,
          targetUserId: ctx.userId,
          status: 'PENDING',
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      });
    }),

  acceptInsight: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const insight = await ctx.db.agentInsight.findUnique({ where: { id: input.id } });

      if (!insight) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Insight not found' });
      }

      await requireWorkspaceMember(ctx.db, insight.workspaceId, ctx.userId);

      if (insight.targetUserId && insight.targetUserId !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your insight' });
      }

      const success = await applyInsightAction(input.id);
      if (!success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Could not apply insight action' });
      }

      return { success: true };
    }),

  dismissInsight: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const insight = await ctx.db.agentInsight.findUnique({ where: { id: input.id } });

      if (!insight) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Insight not found' });
      }

      await requireWorkspaceMember(ctx.db, insight.workspaceId, ctx.userId);

      if (insight.targetUserId && insight.targetUserId !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your insight' });
      }

      await ctx.db.agentInsight.update({
        where: { id: input.id },
        data: { status: 'DISMISSED', actedAt: new Date() },
      });

      return { success: true };
    }),

  revertInsight: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const insight = await ctx.db.agentInsight.findUnique({ where: { id: input.id } });

      if (!insight) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Insight not found' });
      }

      await requireWorkspaceMember(ctx.db, insight.workspaceId, ctx.userId);

      if (insight.targetUserId && insight.targetUserId !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your insight' });
      }

      const success = await revertInsightAction(input.id);
      if (!success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Could not revert insight action' });
      }

      return { success: true };
    }),

  getConfig: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAdmin(ctx.db, input.workspaceId, ctx.userId);

      let config = await ctx.db.agentConfig.findUnique({
        where: { workspaceId: input.workspaceId },
      });

      if (!config) {
        config = await ctx.db.agentConfig.create({
          data: { workspaceId: input.workspaceId },
        });
      }

      return config;
    }),

  updateConfig: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        staleTaskDays: z.number().min(1).max(30).optional(),
        overdueEnabled: z.boolean().optional(),
        digestEnabled: z.boolean().optional(),
        digestHourUtc: z.number().min(0).max(23).optional(),
        duplicateCheck: z.boolean().optional(),
        autoUnblock: z.boolean().optional(),
        workloadAlerts: z.boolean().optional(),
        decomposeThreshold: z.number().min(100).max(2000).optional(),
        maxInsightsPerDay: z.number().min(1).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAdmin(ctx.db, input.workspaceId, ctx.userId);

      const { workspaceId, ...data } = input;

      return ctx.db.agentConfig.upsert({
        where: { workspaceId },
        create: { workspaceId, ...data },
        update: data,
      });
    }),

  // Admin-only: manually trigger analysis for debugging
  runAnalysis: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        schedule: z.enum(['15min', 'daily', 'weekly']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAdmin(ctx.db, input.workspaceId, ctx.userId);

      const insightsCreated = await runPeriodicAnalysis(input.workspaceId, input.schedule);
      return { insightsCreated };
    }),
});
