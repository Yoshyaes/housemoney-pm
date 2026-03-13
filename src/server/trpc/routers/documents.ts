import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { Prisma, DocType } from '@/generated/prisma/client';

export const documentsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        docType: z.nativeEnum(DocType).optional(),
        projectId: z.string().optional(),
        tags: z.array(z.string()).optional(),
        pinned: z.boolean().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { workspaceId, docType, projectId, tags, pinned, cursor, limit } = input;

      const where: Prisma.DocumentWhereInput = { workspaceId };
      if (docType) where.docType = docType;
      if (projectId) where.projectId = projectId;
      if (pinned !== undefined) where.pinned = pinned;
      if (tags && tags.length > 0) {
        // All specified tags must be present
        where.tags = { hasEvery: tags };
      }
      if (cursor) {
        where.id = { lt: cursor };
      }

      const items = await ctx.db.document.findMany({
        where,
        orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
        take: limit + 1,
        include: {
          author: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
          project: { select: { id: true, name: true, color: true } },
        },
      });

      let nextCursor: string | null = null;
      if (items.length > limit) {
        const next = items.pop();
        nextCursor = next!.id;
      }

      return {
        items: items.map((doc) => ({
          ...doc,
          contentPreview: doc.content.slice(0, 200),
          content: undefined,
        })),
        nextCursor,
      };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findUnique({
        where: { id: input.id },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
          lastEditedBy: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
          project: { select: { id: true, name: true, color: true } },
        },
      });

      if (!doc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
      }

      return doc;
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        title: z.string().min(1).max(500),
        content: z.string().default(''),
        docType: z.nativeEnum(DocType).default('GENERAL'),
        tags: z.array(z.string()).default([]),
        projectId: z.string().optional(),
        pinned: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.document.create({
        data: {
          workspaceId: input.workspaceId,
          authorId: ctx.userId,
          title: input.title,
          content: input.content,
          docType: input.docType,
          tags: input.tags,
          projectId: input.projectId ?? null,
          pinned: input.pinned,
        },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
          project: { select: { id: true, name: true, color: true } },
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(500).optional(),
        content: z.string().optional(),
        docType: z.nativeEnum(DocType).optional(),
        tags: z.array(z.string()).optional(),
        projectId: z.string().nullable().optional(),
        pinned: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findUniqueOrThrow({ where: { id: input.id } });

      const membership = await ctx.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: doc.workspaceId, userId: ctx.userId } },
      });

      if (doc.authorId !== ctx.userId && membership?.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the author or an admin can edit this document.' });
      }

      const { id, ...data } = input;
      return ctx.db.document.update({
        where: { id },
        data: { ...data, lastEditedById: ctx.userId },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
          lastEditedBy: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } },
          project: { select: { id: true, name: true, color: true } },
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findUniqueOrThrow({ where: { id: input.id } });

      const membership = await ctx.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: doc.workspaceId, userId: ctx.userId } },
      });

      if (doc.authorId !== ctx.userId && membership?.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the author or an admin can delete this document.' });
      }

      await ctx.db.document.delete({ where: { id: input.id } });
    }),

  search: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        query: z.string().min(1).max(200),
        limit: z.number().min(1).max(20).default(8),
      })
    )
    .query(async ({ ctx, input }) => {
      const { workspaceId, query, limit } = input;
      const trimmed = query.trim();

      if (!trimmed) return [];

      const useIlike = trimmed.length < 3;

      const results = useIlike
        ? await ctx.db.$queryRaw<
            Array<{ id: string; title: string; docType: string; tags: string[]; score: number; snippet: string }>
          >(
            Prisma.sql`
              SELECT d.id, d.title, d."docType", d.tags,
                     1.0::float8 AS score,
                     substring(d.content, 1, 200) AS snippet
              FROM "Document" d
              WHERE d."workspaceId" = ${workspaceId}
                AND (d.title ILIKE ${'%' + trimmed + '%'} OR d.content ILIKE ${'%' + trimmed + '%'})
              ORDER BY d."updatedAt" DESC
              LIMIT ${limit}
            `
          )
        : await ctx.db.$queryRaw<
            Array<{ id: string; title: string; docType: string; tags: string[]; score: number; snippet: string }>
          >(
            Prisma.sql`
              SELECT d.id, d.title, d."docType", d.tags,
                     GREATEST(
                       similarity(d.title, ${trimmed}),
                       similarity(d.content, ${trimmed})
                     )::float8 AS score,
                     substring(d.content FROM
                       GREATEST(1, position(lower(${trimmed}) in lower(d.content)) - 60)
                       FOR 200
                     ) AS snippet
              FROM "Document" d
              WHERE d."workspaceId" = ${workspaceId}
                AND (d.title % ${trimmed} OR d.content % ${trimmed})
              ORDER BY score DESC
              LIMIT ${limit}
            `
          );

      return results;
    }),

  listTags: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const results = await ctx.db.$queryRaw<Array<{ tag: string; count: bigint }>>(
        Prisma.sql`
          SELECT unnest(tags) AS tag, COUNT(*)::bigint AS count
          FROM "Document"
          WHERE "workspaceId" = ${input.workspaceId}
          GROUP BY tag
          ORDER BY count DESC, tag ASC
        `
      );

      return results.map((r) => ({ tag: r.tag, count: Number(r.count) }));
    }),
});
