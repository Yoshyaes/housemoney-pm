import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc/trpc';
import { Prisma } from '@/generated/prisma/client';

export const searchRouter = router({
  global: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        query: z.string().min(1).max(200),
        limit: z.number().min(1).max(20).optional().default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const { workspaceId, query, limit } = input;
      const trimmed = query.trim();

      if (!trimmed) {
        return { tasks: [], comments: [], projects: [] };
      }

      // Use ILIKE for short queries (< 3 chars), trigram similarity for longer ones
      const useIlike = trimmed.length < 3;

      const [tasks, comments, projects] = await Promise.all([
        // Search tasks
        useIlike
          ? ctx.db.$queryRaw<
              Array<{
                id: string;
                identifier: string;
                title: string;
                status: string;
                projectId: string | null;
                score: number;
              }>
            >(
              Prisma.sql`
                SELECT t.id, t.identifier, t.title, t.status, t."projectId", 1.0 AS score
                FROM "Task" t
                JOIN "Project" p ON p.id = t."projectId"
                WHERE p."workspaceId" = ${workspaceId}
                  AND (t.title ILIKE ${'%' + trimmed + '%'} OR t.identifier ILIKE ${'%' + trimmed + '%'})
                ORDER BY t."updatedAt" DESC
                LIMIT ${limit}
              `
            )
          : ctx.db.$queryRaw<
              Array<{
                id: string;
                identifier: string;
                title: string;
                status: string;
                projectId: string | null;
                score: number;
              }>
            >(
              Prisma.sql`
                SELECT t.id, t.identifier, t.title, t.status, t."projectId",
                       GREATEST(
                         similarity(t.title, ${trimmed}),
                         similarity(t.identifier, ${trimmed}),
                         similarity(COALESCE(t.description, ''), ${trimmed})
                       )::float8 AS score
                FROM "Task" t
                JOIN "Project" p ON p.id = t."projectId"
                WHERE p."workspaceId" = ${workspaceId}
                  AND (
                    t.title % ${trimmed}
                    OR t.identifier % ${trimmed}
                    OR COALESCE(t.description, '') % ${trimmed}
                  )
                ORDER BY score DESC
                LIMIT ${limit}
              `
            ),

        // Search comments
        useIlike
          ? ctx.db.$queryRaw<
              Array<{
                id: string;
                body: string;
                taskId: string;
                taskIdentifier: string;
                taskTitle: string;
                score: number;
              }>
            >(
              Prisma.sql`
                SELECT c.id, substring(c.body, 1, 150) AS body, c."taskId",
                       t.identifier AS "taskIdentifier", t.title AS "taskTitle", 1.0 AS score
                FROM "Comment" c
                JOIN "Task" t ON t.id = c."taskId"
                JOIN "Project" p ON p.id = t."projectId"
                WHERE p."workspaceId" = ${workspaceId}
                  AND c.body ILIKE ${'%' + trimmed + '%'}
                ORDER BY c."createdAt" DESC
                LIMIT ${limit}
              `
            )
          : ctx.db.$queryRaw<
              Array<{
                id: string;
                body: string;
                taskId: string;
                taskIdentifier: string;
                taskTitle: string;
                score: number;
              }>
            >(
              Prisma.sql`
                SELECT c.id,
                       substring(c.body FROM GREATEST(1, position(lower(${trimmed}) in lower(c.body)) - 60) FOR 150) AS body,
                       c."taskId", t.identifier AS "taskIdentifier", t.title AS "taskTitle",
                       similarity(c.body, ${trimmed})::float8 AS score
                FROM "Comment" c
                JOIN "Task" t ON t.id = c."taskId"
                JOIN "Project" p ON p.id = t."projectId"
                WHERE p."workspaceId" = ${workspaceId}
                  AND c.body % ${trimmed}
                ORDER BY score DESC
                LIMIT ${limit}
              `
            ),

        // Search projects
        useIlike
          ? ctx.db.$queryRaw<
              Array<{
                id: string;
                name: string;
                description: string | null;
                color: string;
                status: string;
                score: number;
              }>
            >(
              Prisma.sql`
                SELECT id, name, description, color, status, 1.0 AS score
                FROM "Project"
                WHERE "workspaceId" = ${workspaceId}
                  AND (name ILIKE ${'%' + trimmed + '%'} OR COALESCE(description, '') ILIKE ${'%' + trimmed + '%'})
                ORDER BY name
                LIMIT ${limit}
              `
            )
          : ctx.db.$queryRaw<
              Array<{
                id: string;
                name: string;
                description: string | null;
                color: string;
                status: string;
                score: number;
              }>
            >(
              Prisma.sql`
                SELECT id, name, description, color, status,
                       GREATEST(
                         similarity(name, ${trimmed}),
                         similarity(COALESCE(description, ''), ${trimmed})
                       )::float8 AS score
                FROM "Project"
                WHERE "workspaceId" = ${workspaceId}
                  AND (name % ${trimmed} OR COALESCE(description, '') % ${trimmed})
                ORDER BY score DESC
                LIMIT ${limit}
              `
            ),
      ]);

      return { tasks, comments, projects };
    }),
});
