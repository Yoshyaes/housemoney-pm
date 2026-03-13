import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';
import {
  parseTaskFromNaturalLanguage,
  triageTask,
  fuzzyMatchMember,
  fuzzyMatchProject,
  fuzzyMatchLabels,
} from '@/server/ai/parse-task';

export const aiRouter = router({
  parseTask: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1).max(500),
        workspaceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'AI features are not configured. Add ANTHROPIC_API_KEY to your environment.',
        });
      }

      // Fetch workspace context in parallel
      const [memberships, projects, labels] = await Promise.all([
        ctx.db.workspaceMember.findMany({
          where: { workspaceId: input.workspaceId },
          include: { user: { select: { id: true, name: true } } },
        }),
        ctx.db.project.findMany({
          where: { workspaceId: input.workspaceId },
          select: { id: true, name: true },
        }),
        ctx.db.label.findMany({
          where: { workspaceId: input.workspaceId },
          select: { id: true, name: true },
        }),
      ]);

      const members = memberships.map((m) => m.user);

      try {
        const parsed = await parseTaskFromNaturalLanguage(input.text, {
          members,
          projects,
          labels,
          currentDate: new Date().toISOString().split('T')[0],
        });

        // Resolve names to IDs
        const assigneeId = fuzzyMatchMember(parsed.assigneeName, members);
        const projectId = fuzzyMatchProject(parsed.projectName, projects);
        const labelIds = fuzzyMatchLabels(parsed.labelNames, labels);

        return {
          title: parsed.title,
          description: parsed.description || null,
          status: parsed.status || 'TODO',
          priority: parsed.priority || 'NONE',
          assigneeId: assigneeId || null,
          assigneeName: assigneeId
            ? members.find((m) => m.id === assigneeId)?.name ?? null
            : null,
          projectId: projectId || null,
          projectName: projectId
            ? projects.find((p) => p.id === projectId)?.name ?? null
            : null,
          dueDate: parsed.dueDateISO || null,
          labelIds,
          labelNames: labelIds
            .map((id) => labels.find((l) => l.id === id)?.name)
            .filter((n): n is string => n !== undefined),
          _unmatched: {
            assignee: parsed.assigneeName && !assigneeId ? parsed.assigneeName : null,
            project: parsed.projectName && !projectId ? parsed.projectName : null,
            labels: (parsed.labelNames || []).filter(
              (n) => !labels.some((l) => l.name.toLowerCase() === n.toLowerCase())
            ),
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        const message =
          error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('rate_limit') || message.includes('429')) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'AI is temporarily unavailable. Please try again in a moment.',
          });
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not parse your request. Try rephrasing.',
        });
      }
    }),

  triageTask: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(300),
        workspaceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'AI features are not configured.',
        });
      }

      const [memberships, labels] = await Promise.all([
        ctx.db.workspaceMember.findMany({
          where: { workspaceId: input.workspaceId },
          include: { user: { select: { id: true, name: true } } },
        }),
        ctx.db.label.findMany({
          where: { workspaceId: input.workspaceId },
          select: { id: true, name: true },
        }),
      ]);

      const members = memberships.map((m) => m.user);

      try {
        const suggestion = await triageTask(input.title, {
          members,
          projects: [],
          labels,
          currentDate: new Date().toISOString().split('T')[0],
        });

        const assigneeId = fuzzyMatchMember(suggestion.assigneeName, members);
        const labelIds = fuzzyMatchLabels(suggestion.labelNames, labels);

        return {
          priority: suggestion.priority || null,
          assigneeId: assigneeId || null,
          assigneeName: assigneeId
            ? members.find((m) => m.id === assigneeId)?.name ?? null
            : null,
          labelIds,
          labelNames: labelIds
            .map((id) => labels.find((l) => l.id === id)?.name)
            .filter((n): n is string => n !== undefined),
          reasoning: suggestion.reasoning || null,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not generate suggestions.',
        });
      }
    }),
});
