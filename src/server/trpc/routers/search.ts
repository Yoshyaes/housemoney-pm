import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, getAccessibleProjectIds } from '@/server/trpc/trpc';
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

      await requireWorkspaceMember(ctx.db, workspaceId, ctx.userId);

      const trimmed = query.trim();

      if (!trimmed) {
        return { tasks: [], comments: [], projects: [], documents: [] };
      }

      // Guest project scoping
      const accessibleIds = await getAccessibleProjectIds(ctx.db, workspaceId, ctx.userId);
      const guestProjectFilter = accessibleIds !== null
        ? Prisma.sql`AND t."projectId" IN (${Prisma.join(accessibleIds.length > 0 ? accessibleIds : ['__none__'])})`
        : Prisma.empty;
      const guestProjectFilterDirect = accessibleIds !== null
        ? Prisma.sql`AND id IN (${Prisma.join(accessibleIds.length > 0 ? accessibleIds : ['__none__'])})`
        : Prisma.empty;
      const guestDocProjectFilter = accessibleIds !== null
        ? Prisma.sql`AND d."projectId" IN (${Prisma.join(accessibleIds.length > 0 ? accessibleIds : ['__none__'])})`
        : Prisma.empty;

      // Use ILIKE for short queries (< 3 chars), trigram similarity for longer ones
      const useIlike = trimmed.length < 3;

      const [tasks, comments, projects, documents] = await Promise.all([
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
                LEFT JOIN "Project" p ON p.id = t."projectId"
                WHERE (p."workspaceId" = ${workspaceId} OR (t."projectId" IS NULL AND t."workspaceId" = ${workspaceId}))
                  AND (t.title ILIKE ${'%' + trimmed + '%'} OR t.identifier ILIKE ${'%' + trimmed + '%'})
                  ${guestProjectFilter}
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
                LEFT JOIN "Project" p ON p.id = t."projectId"
                WHERE (p."workspaceId" = ${workspaceId} OR (t."projectId" IS NULL AND t."workspaceId" = ${workspaceId}))
                  AND (
                    t.title % ${trimmed}
                    OR t.identifier % ${trimmed}
                    OR COALESCE(t.description, '') % ${trimmed}
                  )
                  ${guestProjectFilter}
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
                LEFT JOIN "Project" p ON p.id = t."projectId"
                WHERE (p."workspaceId" = ${workspaceId} OR (t."projectId" IS NULL AND t."workspaceId" = ${workspaceId}))
                  AND c.body ILIKE ${'%' + trimmed + '%'}
                  ${guestProjectFilter}
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
                LEFT JOIN "Project" p ON p.id = t."projectId"
                WHERE (p."workspaceId" = ${workspaceId} OR (t."projectId" IS NULL AND t."workspaceId" = ${workspaceId}))
                  AND c.body % ${trimmed}
                  ${guestProjectFilter}
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
                  ${guestProjectFilterDirect}
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
                  ${guestProjectFilterDirect}
                ORDER BY score DESC
                LIMIT ${limit}
              `
            ),

        // Search documents
        useIlike
          ? ctx.db.$queryRaw<
              Array<{
                id: string;
                title: string;
                docType: string;
                score: number;
                snippet: string;
              }>
            >(
              Prisma.sql`
                SELECT d.id, d.title, d."docType", 1.0::float8 AS score,
                       substring(d.content, 1, 150) AS snippet
                FROM "Document" d
                WHERE d."workspaceId" = ${workspaceId}
                  AND (d.title ILIKE ${'%' + trimmed + '%'} OR d.content ILIKE ${'%' + trimmed + '%'})
                  ${guestDocProjectFilter}
                ORDER BY d."updatedAt" DESC
                LIMIT ${limit}
              `
            )
          : ctx.db.$queryRaw<
              Array<{
                id: string;
                title: string;
                docType: string;
                score: number;
                snippet: string;
              }>
            >(
              Prisma.sql`
                SELECT d.id, d.title, d."docType",
                       GREATEST(
                         similarity(d.title, ${trimmed}),
                         similarity(d.content, ${trimmed})
                       )::float8 AS score,
                       substring(d.content FROM
                         GREATEST(1, position(lower(${trimmed}) in lower(d.content)) - 60)
                         FOR 150
                       ) AS snippet
                FROM "Document" d
                WHERE d."workspaceId" = ${workspaceId}
                  AND (d.title % ${trimmed} OR d.content % ${trimmed})
                  ${guestDocProjectFilter}
                ORDER BY score DESC
                LIMIT ${limit}
              `
            ),
      ]);

      return { tasks, comments, projects, documents };
    }),
});
