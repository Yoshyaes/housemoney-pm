import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, getAccessibleProjectIds, requireProjectAccess } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { Prisma, ExperimentStatus, ExperimentPersona, ExperimentChannel, ExperimentType } from '@/generated/prisma/client';

function computeScore(criteria: Record<string, boolean> | null | undefined): number {
  if (!criteria || typeof criteria !== 'object') return 0;
  return Object.values(criteria).filter(Boolean).length;
}

const experimentIncludes = {
  createdBy: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
  owner: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
  project: { select: { id: true, name: true, color: true } },
} as const;

export const experimentsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        status: z.nativeEnum(ExperimentStatus).optional(),
        persona: z.nativeEnum(ExperimentPersona).optional(),
        channel: z.nativeEnum(ExperimentChannel).optional(),
        experimentType: z.nativeEnum(ExperimentType).optional(),
        ownerId: z.string().optional(),
        projectId: z.string().optional(),
        search: z.string().optional(),
        minScore: z.number().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const { workspaceId, status, persona, channel, experimentType, ownerId, projectId, search, minScore, cursor, limit } = input;

      await requireWorkspaceMember(ctx.db, workspaceId, ctx.userId);

      const where: Prisma.ExperimentWhereInput = { workspaceId };

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
      if (persona) where.persona = persona;
      if (channel) where.channel = channel;
      if (experimentType) where.experimentType = experimentType;
      if (ownerId) where.ownerId = ownerId;
      if (minScore !== undefined) where.score = { gte: minScore };
      if (search && search.trim()) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          {
            OR: [
              { title: { contains: search.trim(), mode: 'insensitive' } },
              { hypothesis: { contains: search.trim(), mode: 'insensitive' } },
              { identifier: { contains: search.trim(), mode: 'insensitive' } },
            ],
          },
        ];
      }

      const items = await ctx.db.experiment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: experimentIncludes,
      });

      let nextCursor: string | null = null;
      if (items.length > limit) {
        const next = items.pop();
        nextCursor = next!.id;
      }

      return {
        items: items.map((e) => ({
          ...e,
          hypothesisPreview: e.hypothesis.slice(0, 200),
          hypothesis: undefined,
        })),
        nextCursor,
      };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const experiment = await ctx.db.experiment.findUnique({
        where: { id: input.id },
        include: experimentIncludes,
      });

      if (!experiment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Experiment not found' });
      }

      const membership = await requireWorkspaceMember(ctx.db, experiment.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        if (!experiment.projectId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this experiment' });
        }
        await requireProjectAccess(ctx.db, experiment.projectId, ctx.userId);
      }

      return experiment;
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        title: z.string().min(1).max(500),
        sprint: z.string().optional(),
        persona: z.nativeEnum(ExperimentPersona).optional(),
        cohort: z.string().optional(),
        channel: z.nativeEnum(ExperimentChannel).optional(),
        experimentType: z.nativeEnum(ExperimentType).optional(),
        status: z.nativeEnum(ExperimentStatus).default('BACKLOG'),
        hypothesis: z.string().default(''),
        riskiestAssumption: z.string().optional(),
        learningGoal: z.string().optional(),
        cacEstimate: z.number().optional(),
        monthlyArpu: z.number().optional(),
        ltvEstimate: z.number().optional(),
        paybackPeriod: z.number().optional(),
        depositTarget: z.number().optional(),
        scoringCriteria: z.record(z.string(), z.boolean()).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        resourceCost: z.string().optional(),
        testSize: z.string().optional(),
        primaryMetric: z.string().optional(),
        secondaryMetrics: z.string().optional(),
        killCondition: z.string().optional(),
        projectId: z.string().optional(),
        ownerId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Guests cannot create experiments.' });
      }

      const criteriaInput = input.scoringCriteria as Record<string, boolean> | undefined;
      const score = computeScore(criteriaInput ?? null);

      return ctx.db.$transaction(async (tx) => {
        const workspace = await tx.workspace.update({
          where: { id: input.workspaceId },
          data: { experimentCounter: { increment: 1 } },
        });

        const identifier = `EXP-${String(workspace.experimentCounter).padStart(3, '0')}`;

        return tx.experiment.create({
          data: {
            identifier,
            workspaceId: input.workspaceId,
            createdById: ctx.userId,
            title: input.title,
            sprint: input.sprint ?? null,
            persona: input.persona ?? null,
            cohort: input.cohort ?? null,
            channel: input.channel ?? null,
            experimentType: input.experimentType ?? null,
            status: input.status,
            hypothesis: input.hypothesis,
            riskiestAssumption: input.riskiestAssumption ?? null,
            learningGoal: input.learningGoal ?? null,
            cacEstimate: input.cacEstimate ?? null,
            monthlyArpu: input.monthlyArpu ?? null,
            ltvEstimate: input.ltvEstimate ?? null,
            paybackPeriod: input.paybackPeriod ?? null,
            depositTarget: input.depositTarget ?? null,
            scoringCriteria: criteriaInput ? (criteriaInput as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            score,
            startDate: input.startDate ?? null,
            endDate: input.endDate ?? null,
            resourceCost: input.resourceCost ?? null,
            testSize: input.testSize ?? null,
            primaryMetric: input.primaryMetric ?? null,
            secondaryMetrics: input.secondaryMetrics ?? null,
            killCondition: input.killCondition ?? null,
            projectId: input.projectId ?? null,
            ownerId: input.ownerId ?? null,
          },
          include: experimentIncludes,
        });
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(500).optional(),
        sprint: z.string().nullable().optional(),
        persona: z.nativeEnum(ExperimentPersona).nullable().optional(),
        cohort: z.string().nullable().optional(),
        channel: z.nativeEnum(ExperimentChannel).nullable().optional(),
        experimentType: z.nativeEnum(ExperimentType).nullable().optional(),
        status: z.nativeEnum(ExperimentStatus).optional(),
        hypothesis: z.string().optional(),
        riskiestAssumption: z.string().nullable().optional(),
        learningGoal: z.string().nullable().optional(),
        cacEstimate: z.number().nullable().optional(),
        monthlyArpu: z.number().nullable().optional(),
        ltvEstimate: z.number().nullable().optional(),
        paybackPeriod: z.number().nullable().optional(),
        depositTarget: z.number().nullable().optional(),
        scoringCriteria: z.record(z.string(), z.boolean()).nullable().optional(),
        startDate: z.date().nullable().optional(),
        endDate: z.date().nullable().optional(),
        resourceCost: z.string().nullable().optional(),
        testSize: z.string().nullable().optional(),
        primaryMetric: z.string().nullable().optional(),
        secondaryMetrics: z.string().nullable().optional(),
        killCondition: z.string().nullable().optional(),
        projectId: z.string().nullable().optional(),
        ownerId: z.string().nullable().optional(),
        // Results
        whatHappened: z.string().nullable().optional(),
        primaryMetricResult: z.string().nullable().optional(),
        secondaryMetricResults: z.string().nullable().optional(),
        unexpectedFindings: z.string().nullable().optional(),
        // Decisions
        didWeLearn: z.string().nullable().optional(),
        continueExperiment: z.string().nullable().optional(),
        continuePersona: z.string().nullable().optional(),
        nextAction: z.string().nullable().optional(),
        investorReadyInsight: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const experiment = await ctx.db.experiment.findUniqueOrThrow({ where: { id: input.id } });

      const membership = await requireWorkspaceMember(ctx.db, experiment.workspaceId, ctx.userId);

      if (experiment.createdById !== ctx.userId && membership.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the creator or an admin can edit this experiment.' });
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, scoringCriteria, ...data } = input;

      // Recompute score if scoring criteria changed
      let score: number | undefined;
      let criteriaData: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
      if (scoringCriteria !== undefined) {
        const typedCriteria = scoringCriteria as Record<string, boolean> | null;
        criteriaData = typedCriteria === null ? Prisma.JsonNull : (typedCriteria as unknown as Prisma.InputJsonValue);
        score = computeScore(typedCriteria);
      }

      return ctx.db.experiment.update({
        where: { id: input.id },
        data: {
          ...data,
          ...(criteriaData !== undefined ? { scoringCriteria: criteriaData } : {}),
          ...(score !== undefined ? { score } : {}),
        },
        include: experimentIncludes,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const experiment = await ctx.db.experiment.findUniqueOrThrow({ where: { id: input.id } });

      const membership = await requireWorkspaceMember(ctx.db, experiment.workspaceId, ctx.userId);

      if (experiment.createdById !== ctx.userId && membership.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the creator or an admin can delete this experiment.' });
      }

      await ctx.db.experiment.delete({ where: { id: input.id } });
    }),

  getStats: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      const [statusCounts, avgScore, totalCount] = await Promise.all([
        ctx.db.experiment.groupBy({
          by: ['status'],
          where: { workspaceId: input.workspaceId },
          _count: true,
        }),
        ctx.db.experiment.aggregate({
          where: { workspaceId: input.workspaceId, score: { not: null } },
          _avg: { score: true },
        }),
        ctx.db.experiment.count({
          where: { workspaceId: input.workspaceId },
        }),
      ]);

      return {
        byStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
        avgScore: avgScore._avg.score ?? 0,
        totalCount,
      };
    }),
});
