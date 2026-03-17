import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, requireWorkspaceAdmin } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

export const viewsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      return ctx.db.view.findMany({
        where: {
          workspaceId: input.workspaceId,
          OR: [{ ownerId: ctx.userId }, { scope: 'WORKSPACE' }],
        },
        orderBy: { createdAt: 'asc' },
      });
    }),

  save: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1),
        scope: z.enum(['PERSONAL', 'WORKSPACE']).optional(),
        filters: z.any().refine((v) => JSON.stringify(v).length < 10000, 'Filters too large').default({}),
        sort: z.any().refine((v) => JSON.stringify(v).length < 10000, 'Sort config too large').default({}),
        groupBy: z.string().optional(),
        swimlaneBy: z.string().optional(),
        displayType: z.enum(['board', 'list', 'timeline']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      // Guests can only create personal views
      if (membership.role === 'GUEST' && input.scope === 'WORKSPACE') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Guests cannot create workspace-scoped views.' });
      }

      return ctx.db.view.create({
        data: {
          ...input,
          ownerId: ctx.userId,
          scope: input.scope || 'PERSONAL',
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        scope: z.enum(['PERSONAL', 'WORKSPACE']).optional(),
        filters: z.any().refine((v) => !v || JSON.stringify(v).length < 10000, 'Filters too large').optional(),
        sort: z.any().refine((v) => !v || JSON.stringify(v).length < 10000, 'Sort config too large').optional(),
        groupBy: z.string().nullable().optional(),
        swimlaneBy: z.string().nullable().optional(),
        displayType: z.enum(['board', 'list', 'timeline']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const view = await ctx.db.view.findUniqueOrThrow({ where: { id: input.id } });

      const membership = await requireWorkspaceMember(ctx.db, view.workspaceId, ctx.userId);

      // Guests cannot escalate to workspace scope
      if (membership.role === 'GUEST' && input.scope === 'WORKSPACE') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Guests cannot create workspace-scoped views.' });
      }

      if (view.ownerId !== ctx.userId) {
        await requireWorkspaceAdmin(ctx.db, view.workspaceId, ctx.userId);
      }

      const { id, ...data } = input;
      return ctx.db.view.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const view = await ctx.db.view.findUniqueOrThrow({ where: { id: input.id } });

      await requireWorkspaceMember(ctx.db, view.workspaceId, ctx.userId);

      if (view.ownerId !== ctx.userId) {
        await requireWorkspaceAdmin(ctx.db, view.workspaceId, ctx.userId);
      }

      return ctx.db.view.delete({ where: { id: input.id } });
    }),
});
