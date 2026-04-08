import { z } from 'zod';
import { router, protectedProcedure, requireNonGuest } from '@/server/trpc/trpc';
import { Prisma, PrismaClient } from '@/generated/prisma/client';
import { TRPCError } from '@trpc/server';
import { format } from 'date-fns';

const analyticsInput = z.object({
  workspaceId: z.string(),
  projectId: z.string().optional(),
  dateRange: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
});

async function validateProjectScope(
  db: PrismaClient,
  workspaceId: string,
  projectId: string | undefined
) {
  if (!projectId) return;
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  if (!project || project.workspaceId !== workspaceId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Project does not belong to this workspace.' });
  }
}

function getSinceDate(range: '7d' | '30d' | '90d' | 'all'): Date | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export const analyticsRouter = router({
  summary: protectedProcedure
    .input(analyticsInput)
    .query(async ({ ctx, input }) => {
      await requireNonGuest(ctx.db, input.workspaceId, ctx.userId);
      await validateProjectScope(ctx.db, input.workspaceId, input.projectId);

      const since = getSinceDate(input.dateRange);
      const projectFilter = input.projectId ? { projectId: input.projectId } : {};

      const [completed, overdue, blocked, open] = await Promise.all([
        ctx.db.task.count({
          where: {
            workspaceId: input.workspaceId,
            ...projectFilter,
            status: 'DONE',
            ...(since ? { updatedAt: { gte: since } } : {}),
          },
        }),
        ctx.db.task.count({
          where: {
            workspaceId: input.workspaceId,
            ...projectFilter,
            status: { notIn: ['DONE', 'CANCELLED'] },
            dueDate: { lt: new Date() },
          },
        }),
        ctx.db.task.count({
          where: {
            workspaceId: input.workspaceId,
            ...projectFilter,
            status: { notIn: ['DONE', 'CANCELLED'] },
            blockedBy: {
              some: {
                blockingTask: { status: { notIn: ['DONE', 'CANCELLED'] } },
              },
            },
          },
        }),
        ctx.db.task.count({
          where: {
            workspaceId: input.workspaceId,
            ...projectFilter,
            status: { notIn: ['DONE', 'CANCELLED'] },
          },
        }),
      ]);

      return { completed, overdue, blocked, open };
    }),

  throughput: protectedProcedure
    .input(analyticsInput)
    .query(async ({ ctx, input }) => {
      await requireNonGuest(ctx.db, input.workspaceId, ctx.userId);
      await validateProjectScope(ctx.db, input.workspaceId, input.projectId);

      const since = getSinceDate(input.dateRange);

      const rows = await ctx.db.$queryRaw<Array<{ week: Date; count: bigint }>>`
        SELECT
          date_trunc('week', "updatedAt") AS week,
          COUNT(*) AS count
        FROM "Task"
        WHERE
          "workspaceId" = ${input.workspaceId}
          ${input.projectId ? Prisma.sql`AND "projectId" = ${input.projectId}` : Prisma.empty}
          AND status = 'DONE'
          ${since ? Prisma.sql`AND "updatedAt" >= ${since}` : Prisma.empty}
        GROUP BY date_trunc('week', "updatedAt")
        ORDER BY week ASC
      `;

      return rows.map((r) => ({
        week: format(r.week, 'MMM d'),
        completed: Number(r.count),
      }));
    }),

  cycleTime: protectedProcedure
    .input(analyticsInput)
    .query(async ({ ctx, input }) => {
      await requireNonGuest(ctx.db, input.workspaceId, ctx.userId);
      await validateProjectScope(ctx.db, input.workspaceId, input.projectId);

      const since = getSinceDate(input.dateRange);

      const rows = await ctx.db.$queryRaw<Array<{
        taskId: string;
        identifier: string;
        title: string;
        startedAt: Date;
        completedAt: Date;
        cycleHours: number;
      }>>`
        WITH done_tasks AS (
          SELECT DISTINCT a."taskId"
          FROM "Activity" a
          JOIN "Task" t ON t.id = a."taskId"
          WHERE t."workspaceId" = ${input.workspaceId}
            ${input.projectId ? Prisma.sql`AND t."projectId" = ${input.projectId}` : Prisma.empty}
            AND a.action = 'status_changed'
            AND a."newValue" = 'DONE'
            ${since ? Prisma.sql`AND a."createdAt" >= ${since}` : Prisma.empty}
        ),
        first_inprogress AS (
          SELECT a."taskId", MIN(a."createdAt") AS "startedAt"
          FROM "Activity" a
          JOIN done_tasks d ON d."taskId" = a."taskId"
          WHERE a.action = 'status_changed' AND a."newValue" = 'IN_PROGRESS'
          GROUP BY a."taskId"
        ),
        first_done AS (
          SELECT a."taskId", MIN(a."createdAt") AS "completedAt"
          FROM "Activity" a
          JOIN done_tasks d ON d."taskId" = a."taskId"
          WHERE a.action = 'status_changed' AND a."newValue" = 'DONE'
          GROUP BY a."taskId"
        )
        SELECT
          t.id AS "taskId",
          t.identifier,
          t.title,
          fi."startedAt",
          fd."completedAt",
          EXTRACT(EPOCH FROM (fd."completedAt" - fi."startedAt")) / 3600.0 AS "cycleHours"
        FROM "Task" t
        JOIN first_inprogress fi ON fi."taskId" = t.id
        JOIN first_done fd ON fd."taskId" = t.id
        WHERE fd."completedAt" > fi."startedAt"
        ORDER BY "cycleHours" ASC
      `;

      const hours = rows.map((r) => Number(r.cycleHours));

      const sortedHours = [...hours].sort((a, b) => a - b);
      const median = sortedHours.length
        ? sortedHours[Math.floor(sortedHours.length / 2)]
        : null;
      const avg = hours.length
        ? hours.reduce((s, h) => s + h, 0) / hours.length
        : null;

      const buckets = [
        { label: '< 1d', min: 0, max: 24 },
        { label: '1–3d', min: 24, max: 72 },
        { label: '3–7d', min: 72, max: 168 },
        { label: '1–2w', min: 168, max: 336 },
        { label: '> 2w', min: 336, max: Infinity },
      ];
      const histogram = buckets.map((b) => ({
        label: b.label,
        count: hours.filter((h) => h >= b.min && h < b.max).length,
      }));

      return {
        medianHours: median,
        avgHours: avg,
        histogram,
        tasks: rows.slice(0, 20).map((r) => ({
          ...r,
          cycleHours: Number(r.cycleHours),
        })),
      };
    }),

  statusDistribution: protectedProcedure
    .input(analyticsInput)
    .query(async ({ ctx, input }) => {
      await requireNonGuest(ctx.db, input.workspaceId, ctx.userId);
      await validateProjectScope(ctx.db, input.workspaceId, input.projectId);

      const rows = await ctx.db.task.groupBy({
        by: ['status'],
        where: {
          workspaceId: input.workspaceId,
          ...(input.projectId ? { projectId: input.projectId } : {}),
        },
        _count: { _all: true },
      });

      return rows.map((r) => ({ status: r.status, count: r._count._all }));
    }),

  priorityDistribution: protectedProcedure
    .input(analyticsInput)
    .query(async ({ ctx, input }) => {
      await requireNonGuest(ctx.db, input.workspaceId, ctx.userId);
      await validateProjectScope(ctx.db, input.workspaceId, input.projectId);

      const rows = await ctx.db.task.groupBy({
        by: ['priority'],
        where: {
          workspaceId: input.workspaceId,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          status: { notIn: ['DONE', 'CANCELLED'] },
        },
        _count: { _all: true },
      });

      return rows.map((r) => ({ priority: r.priority, count: r._count._all }));
    }),

  workloadByAssignee: protectedProcedure
    .input(analyticsInput)
    .query(async ({ ctx, input }) => {
      await requireNonGuest(ctx.db, input.workspaceId, ctx.userId);
      await validateProjectScope(ctx.db, input.workspaceId, input.projectId);

      const rows = await ctx.db.$queryRaw<Array<{
        userId: string;
        name: string;
        avatarColor: string | null;
        status: string;
        count: bigint;
      }>>`
        SELECT
          u.id AS "userId",
          u.name,
          u."avatarColor",
          t.status,
          COUNT(*) AS count
        FROM "Task" t
        JOIN "User" u ON u.id = t."assigneeId"
        WHERE t."workspaceId" = ${input.workspaceId}
          ${input.projectId ? Prisma.sql`AND t."projectId" = ${input.projectId}` : Prisma.empty}
          AND t.status NOT IN ('DONE', 'CANCELLED')
        GROUP BY u.id, u.name, u."avatarColor", t.status
        ORDER BY u.name, t.status
      `;

      const byUser = new Map<string, {
        userId: string;
        name: string;
        avatarColor: string | null;
        BACKLOG: number;
        TODO: number;
        IN_PROGRESS: number;
        IN_REVIEW: number;
        total: number;
      }>();

      for (const row of rows) {
        if (!byUser.has(row.userId)) {
          byUser.set(row.userId, {
            userId: row.userId,
            name: row.name,
            avatarColor: row.avatarColor,
            BACKLOG: 0,
            TODO: 0,
            IN_PROGRESS: 0,
            IN_REVIEW: 0,
            total: 0,
          });
        }
        const entry = byUser.get(row.userId)!;
        if (row.status === 'BACKLOG') entry.BACKLOG = Number(row.count);
        else if (row.status === 'TODO') entry.TODO = Number(row.count);
        else if (row.status === 'IN_PROGRESS') entry.IN_PROGRESS = Number(row.count);
        else if (row.status === 'IN_REVIEW') entry.IN_REVIEW = Number(row.count);
        entry.total += Number(row.count);
      }

      return Array.from(byUser.values()).sort((a, b) => b.total - a.total);
    }),

  cumulativeFlow: protectedProcedure
    .input(analyticsInput)
    .query(async ({ ctx, input }) => {
      await requireNonGuest(ctx.db, input.workspaceId, ctx.userId);
      await validateProjectScope(ctx.db, input.workspaceId, input.projectId);

      const since = getSinceDate(input.dateRange) ?? new Date(Date.now() - 90 * 86400_000);

      // Sample weekly to keep query cost low
      const rows = await ctx.db.$queryRaw<Array<{
        week: Date;
        status: string;
        count: bigint;
      }>>`
        WITH weeks AS (
          SELECT generate_series(
            date_trunc('week', ${since}::timestamptz),
            date_trunc('week', NOW()),
            '1 week'::interval
          ) AS week_start
        ),
        task_status_at_week AS (
          SELECT
            t.id AS task_id,
            w.week_start,
            COALESCE(
              (
                SELECT a."newValue"
                FROM "Activity" a
                WHERE a."taskId" = t.id
                  AND a.action = 'status_changed'
                  AND a."createdAt" <= w.week_start + INTERVAL '6 days 23:59:59'
                ORDER BY a."createdAt" DESC
                LIMIT 1
              ),
              t.status::text
            ) AS status
          FROM "Task" t
          CROSS JOIN weeks w
          WHERE t."workspaceId" = ${input.workspaceId}
            ${input.projectId ? Prisma.sql`AND t."projectId" = ${input.projectId}` : Prisma.empty}
            AND t."createdAt" <= w.week_start + INTERVAL '6 days 23:59:59'
        )
        SELECT week_start AS week, status, COUNT(*) AS count
        FROM task_status_at_week
        GROUP BY week_start, status
        ORDER BY week_start, status
      `;

      const byWeek = new Map<string, {
        date: string;
        BACKLOG: number;
        TODO: number;
        IN_PROGRESS: number;
        IN_REVIEW: number;
        DONE: number;
        CANCELLED: number;
      }>();

      for (const row of rows) {
        const key = format(row.week, 'MMM d');
        if (!byWeek.has(key)) {
          byWeek.set(key, { date: key, BACKLOG: 0, TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0, CANCELLED: 0 });
        }
        const entry = byWeek.get(key)!;
        const s = row.status;
        if (s === 'BACKLOG') entry.BACKLOG = Number(row.count);
        else if (s === 'TODO') entry.TODO = Number(row.count);
        else if (s === 'IN_PROGRESS') entry.IN_PROGRESS = Number(row.count);
        else if (s === 'IN_REVIEW') entry.IN_REVIEW = Number(row.count);
        else if (s === 'DONE') entry.DONE = Number(row.count);
        else if (s === 'CANCELLED') entry.CANCELLED = Number(row.count);
      }

      return Array.from(byWeek.values());
    }),

  projectHealth: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireNonGuest(ctx.db, input.workspaceId, ctx.userId);
      await validateProjectScope(ctx.db, input.workspaceId, input.projectId);

      const projects = await ctx.db.project.findMany({
        where: { workspaceId: input.workspaceId },
        include: {
          tasks: {
            select: {
              id: true,
              status: true,
              dueDate: true,
              blockedBy: {
                where: {
                  blockingTask: { status: { notIn: ['DONE', 'CANCELLED'] } },
                },
                select: { id: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const now = new Date();

      return projects.map((p) => {
        const total = p.tasks.length;
        const done = p.tasks.filter((t) => t.status === 'DONE').length;
        const cancelled = p.tasks.filter((t) => t.status === 'CANCELLED').length;
        const open = total - done - cancelled;
        const overdue = p.tasks.filter(
          (t) =>
            t.dueDate &&
            t.dueDate < now &&
            !['DONE', 'CANCELLED'].includes(t.status)
        ).length;
        const blocked = p.tasks.filter((t) => t.blockedBy.length > 0).length;
        const progress = total > 0 ? Math.round((done / total) * 100) : 0;

        return {
          projectId: p.id,
          name: p.name,
          color: p.color,
          status: p.status,
          total,
          done,
          open,
          overdue,
          blocked,
          progress,
          targetDate: p.targetDate,
        };
      });
    }),
});
