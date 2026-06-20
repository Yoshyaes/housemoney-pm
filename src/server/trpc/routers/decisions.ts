import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, getAccessibleProjectIds, requireProjectAccess } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { Prisma, DecisionStatus } from '@/generated/prisma/client';

export const decisionsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        status: z.nativeEnum(DecisionStatus).optional(),
        category: z.string().optional(),
        participantId: z.string().optional(),
        projectId: z.string().optional(),
        search: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const { workspaceId, status, category, participantId, projectId, search, cursor, limit } = input;

      await requireWorkspaceMember(ctx.db, workspaceId, ctx.userId);

      const where: Prisma.DecisionWhereInput = { workspaceId };

      // Guest scoping
      const accessibleIds = await getAccessibleProjectIds(ctx.db, workspaceId, ctx.userId);
      if (accessibleIds !== null) {
        if (projectId) {
          if (!accessibleIds.includes(projectId)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this project' });
          }
          where.projectId = projectId;
        } else {
          where.projectId = { in: accessibleIds };
        }
      } else if (projectId) {
        where.projectId = projectId;
      }

      if (status) where.status = status;
      if (category) where.category = category;
      if (participantId) {
        where.participants = { some: { userId: participantId } };
      }
      if (search && search.trim()) {
        where.OR = [
          { title: { contains: search.trim(), mode: 'insensitive' } },
          { body: { contains: search.trim(), mode: 'insensitive' } },
        ];
      }
      const items = await ctx.db.decision.findMany({
        where,
        orderBy: [{ decisionDate: 'desc' }, { createdAt: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          createdBy: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
          project: { select: { id: true, name: true, color: true } },
          participants: {
            include: {
              user: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
            },
          },
          supersededBy: { select: { id: true, title: true } },
        },
      });

      let nextCursor: string | null = null;
      if (items.length > limit) {
        const next = items.pop();
        nextCursor = next!.id;
      }

      return {
        items: items.map((d) => ({
          ...d,
          bodyPreview: d.body.slice(0, 200),
          body: undefined,
        })),
        nextCursor,
      };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const decision = await ctx.db.decision.findUnique({
        where: { id: input.id },
        include: {
          createdBy: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
          project: { select: { id: true, name: true, color: true } },
          participants: {
            include: {
              user: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
            },
          },
          supersededBy: { select: { id: true, title: true } },
          supersedes: { select: { id: true, title: true, status: true } },
        },
      });

      if (!decision) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Decision not found' });
      }

      const membership = await requireWorkspaceMember(ctx.db, decision.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        if (!decision.projectId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this decision' });
        }
        await requireProjectAccess(ctx.db, decision.projectId, ctx.userId);
      }

      return decision;
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        title: z.string().min(1).max(500),
        body: z.string().max(100000).default(''),
        status: z.nativeEnum(DecisionStatus).default('DRAFT'),
        category: z.string().optional(),
        decisionDate: z.date().optional(),
        projectId: z.string().optional(),
        participantIds: z.array(z.string()).default([]),
        supersedesIds: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Guests cannot create decisions.' });
      }

      // Ensure creator is always a participant
      const participantSet = new Set(input.participantIds);
      participantSet.add(ctx.userId);

      return ctx.db.$transaction(async (tx) => {
        const decision = await tx.decision.create({
          data: {
            workspaceId: input.workspaceId,
            title: input.title,
            body: input.body,
            status: input.status,
            category: input.category ?? null,
            decisionDate: input.decisionDate ?? new Date(),
            projectId: input.projectId ?? null,
            createdById: ctx.userId,
            participants: {
              createMany: {
                data: Array.from(participantSet).map((userId) => ({ userId })),
              },
            },
          },
          include: {
            createdBy: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
            project: { select: { id: true, name: true, color: true } },
            participants: {
              include: {
                user: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
              },
            },
          },
        });

        // Mark superseded decisions (only those not already superseded by someone else)
        if (input.supersedesIds.length > 0) {
          const targets = await tx.decision.findMany({
            where: { id: { in: input.supersedesIds }, workspaceId: input.workspaceId },
            select: { id: true, status: true, supersededById: true },
          });
          const alreadySuperseded = targets.filter((t) => t.supersededById !== null);
          if (alreadySuperseded.length > 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Cannot supersede decisions that are already superseded by another decision.`,
            });
          }
          await tx.decision.updateMany({
            where: { id: { in: targets.map((t) => t.id) } },
            data: { supersededById: decision.id, status: 'SUPERSEDED' },
          });
        }

        return decision;
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(500).optional(),
        body: z.string().max(100000).optional(),
        status: z.nativeEnum(DecisionStatus).optional(),
        category: z.string().nullable().optional(),
        decisionDate: z.date().optional(),
        projectId: z.string().nullable().optional(),
        participantIds: z.array(z.string()).optional(),
        supersedesIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const decision = await ctx.db.decision.findUniqueOrThrow({ where: { id: input.id } });

      const membership = await requireWorkspaceMember(ctx.db, decision.workspaceId, ctx.userId);

      if (decision.createdById !== ctx.userId && membership.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the creator or an admin can edit this decision.' });
      }

      return ctx.db.$transaction(async (tx) => {
        // Sync participants if provided
        if (input.participantIds !== undefined) {
          const participantSet = new Set(input.participantIds);
          participantSet.add(decision.createdById); // always keep creator
          await tx.decisionParticipant.deleteMany({ where: { decisionId: input.id } });
          await tx.decisionParticipant.createMany({
            data: Array.from(participantSet).map((userId) => ({ decisionId: input.id, userId })),
          });
        }

        // Handle supersession changes
        if (input.supersedesIds !== undefined) {
          // Clear old supersession links — only clear the pointer, leave status for manual control
          // (we don't know the original status before supersession, so we set back to ACTIVE as the safe default for non-revoked)
          const previouslySuperseded = await tx.decision.findMany({
            where: { supersededById: input.id },
            select: { id: true },
          });
          if (previouslySuperseded.length > 0) {
            // Only reset status to ACTIVE for decisions that are currently SUPERSEDED
            await tx.decision.updateMany({
              where: { supersededById: input.id, status: 'SUPERSEDED' },
              data: { supersededById: null, status: 'ACTIVE' },
            });
            // For non-SUPERSEDED ones (e.g. REVOKED), just clear the pointer
            await tx.decision.updateMany({
              where: { supersededById: input.id },
              data: { supersededById: null },
            });
          }
          // Set new supersession links (reject already-superseded)
          if (input.supersedesIds.length > 0) {
            const targets = await tx.decision.findMany({
              where: { id: { in: input.supersedesIds }, workspaceId: decision.workspaceId },
              select: { id: true, supersededById: true },
            });
            const alreadySuperseded = targets.filter((t) => t.supersededById !== null && t.supersededById !== input.id);
            if (alreadySuperseded.length > 0) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Cannot supersede decisions that are already superseded by another decision.`,
              });
            }
            await tx.decision.updateMany({
              where: { id: { in: targets.map((t) => t.id) } },
              data: { supersededById: input.id, status: 'SUPERSEDED' },
            });
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, participantIds, supersedesIds, ...data } = input;
        return tx.decision.update({
          where: { id },
          data,
          include: {
            createdBy: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
            project: { select: { id: true, name: true, color: true } },
            participants: {
              include: {
                user: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
              },
            },
            supersededBy: { select: { id: true, title: true } },
            supersedes: { select: { id: true, title: true, status: true } },
          },
        });
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const decision = await ctx.db.decision.findUniqueOrThrow({ where: { id: input.id } });

      const membership = await requireWorkspaceMember(ctx.db, decision.workspaceId, ctx.userId);

      if (decision.createdById !== ctx.userId && membership.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the creator or an admin can delete this decision.' });
      }

      await ctx.db.decision.delete({ where: { id: input.id } });
    }),

  listCategories: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      const results = await ctx.db.$queryRaw<Array<{ category: string }>>(
        Prisma.sql`
          SELECT DISTINCT category
          FROM "Decision"
          WHERE "workspaceId" = ${input.workspaceId}
            AND category IS NOT NULL
          ORDER BY category
        `
      );

      return results.map((r) => r.category);
    }),
});
