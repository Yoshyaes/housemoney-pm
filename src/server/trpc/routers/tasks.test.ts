import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type MockPrisma } from '@/test/helpers/mock-prisma';
import { testUser, testUser2, testWorkspace, testTask } from '@/test/helpers/fixtures';

// Use vi.hoisted to create mocks that are available during vi.mock hoisting
const { mockRouter, mockProcedure, tTest } = vi.hoisted(() => {
  const { initTRPC } = require('@trpc/server');
  const superjson = require('superjson');
  const t = initTRPC.context().create({ transformer: superjson });
  return { mockRouter: t.router, mockProcedure: t.procedure, tTest: t };
});

vi.mock('@/server/trpc/trpc', () => ({
  router: mockRouter,
  publicProcedure: mockProcedure,
  protectedProcedure: mockProcedure,
}));

import { createMockPrisma } from '@/test/helpers/mock-prisma';
import { tasksRouter } from '@/server/trpc/routers/tasks';

const appRouter = mockRouter({ tasks: tasksRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('tasks router', () => {
  let db: MockPrisma;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockPrisma();
    caller = createCaller({
      db: db as any,
      user: testUser as any,
      userId: testUser.id,
    });
  });

  describe('create', () => {
    it('creates a task with auto-incremented identifier', async () => {
      const updatedWorkspace = { ...testWorkspace, taskCounter: 11 };
      db.workspace.update.mockResolvedValue(updatedWorkspace);

      const createdTask = {
        ...testTask,
        id: 'new-task',
        identifier: 'HM-11',
        title: 'New task',
        assigneeId: null,
      };
      db.task.create.mockResolvedValue(createdTask);
      db.activity.create.mockResolvedValue({});

      const result = await caller.tasks.create({
        title: 'New task',
        workspaceId: 'ws-1',
      });

      expect(db.workspace.update).toHaveBeenCalledWith({
        where: { id: 'ws-1' },
        data: { taskCounter: { increment: 1 } },
      });
      expect(db.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            identifier: 'HM-11',
            title: 'New task',
            createdById: 'user-1',
          }),
        })
      );
      expect(result.identifier).toBe('HM-11');
    });

    it('creates activity log on task creation', async () => {
      db.workspace.update.mockResolvedValue({ ...testWorkspace, taskCounter: 11 });
      db.task.create.mockResolvedValue({ ...testTask, assigneeId: null });
      db.activity.create.mockResolvedValue({});

      await caller.tasks.create({ title: 'Test', workspaceId: 'ws-1' });

      expect(db.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'created',
          userId: 'user-1',
        }),
      });
    });

    it('notifies assignee when assigned to someone else', async () => {
      db.workspace.update.mockResolvedValue({ ...testWorkspace, taskCounter: 11 });
      db.task.create.mockResolvedValue({
        ...testTask,
        assigneeId: 'user-2',
        identifier: 'HM-11',
        title: 'Assigned task',
      });
      db.activity.create.mockResolvedValue({});
      db.notification.create.mockResolvedValue({});

      await caller.tasks.create({
        title: 'Assigned task',
        workspaceId: 'ws-1',
        assigneeId: 'user-2',
      });

      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-2',
          type: 'ASSIGNED',
          actorId: 'user-1',
        }),
      });
    });

    it('does not notify when self-assigned', async () => {
      db.workspace.update.mockResolvedValue({ ...testWorkspace, taskCounter: 11 });
      db.task.create.mockResolvedValue({
        ...testTask,
        assigneeId: 'user-1',
      });
      db.activity.create.mockResolvedValue({});

      await caller.tasks.create({
        title: 'Self-assigned',
        workspaceId: 'ws-1',
        assigneeId: 'user-1',
      });

      expect(db.notification.create).not.toHaveBeenCalled();
    });

    it('creates task with labels', async () => {
      db.workspace.update.mockResolvedValue({ ...testWorkspace, taskCounter: 11 });
      db.task.create.mockResolvedValue({ ...testTask, assigneeId: null });
      db.activity.create.mockResolvedValue({});

      await caller.tasks.create({
        title: 'Labeled task',
        workspaceId: 'ws-1',
        labelIds: ['label-1', 'label-2'],
      });

      expect(db.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            labels: {
              create: [{ labelId: 'label-1' }, { labelId: 'label-2' }],
            },
          }),
        })
      );
    });
  });

  describe('list', () => {
    it('returns tasks with default filters (excludes CANCELLED)', async () => {
      db.task.findMany.mockResolvedValue([testTask]);

      const result = await caller.tasks.list({ workspaceId: 'ws-1' });

      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: 'CANCELLED' },
          }),
          orderBy: { createdAt: 'desc' },
        })
      );
      expect(result.tasks).toHaveLength(1);
      expect(result.nextCursor).toBeUndefined();
    });

    it('filters by status when provided', async () => {
      db.task.findMany.mockResolvedValue([]);

      await caller.tasks.list({ workspaceId: 'ws-1', status: ['TODO', 'IN_PROGRESS'] });

      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['TODO', 'IN_PROGRESS'] },
          }),
        })
      );
    });

    it('filters by priority', async () => {
      db.task.findMany.mockResolvedValue([]);

      await caller.tasks.list({ workspaceId: 'ws-1', priority: ['HIGH', 'URGENT'] });

      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: { in: ['HIGH', 'URGENT'] },
          }),
        })
      );
    });

    it('filters by assigneeId', async () => {
      db.task.findMany.mockResolvedValue([]);

      await caller.tasks.list({ workspaceId: 'ws-1', assigneeId: ['user-2'] });

      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assigneeId: { in: ['user-2'] },
          }),
        })
      );
    });

    it('filters by blocked status', async () => {
      db.task.findMany.mockResolvedValue([]);

      await caller.tasks.list({ workspaceId: 'ws-1', isBlocked: true });

      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            blockedBy: {
              some: { blockingTask: { status: { notIn: ['DONE', 'CANCELLED'] } } },
            },
          }),
        })
      );
    });

    it('returns nextCursor when more items exist', async () => {
      // Default limit is 100, so we need 101 items to trigger nextCursor
      const manyTasks = Array.from({ length: 101 }, (_, i) => ({
        ...testTask,
        id: `task-${i}`,
      }));
      db.task.findMany.mockResolvedValue(manyTasks);

      const result = await caller.tasks.list({ workspaceId: 'ws-1' });

      expect(result.tasks).toHaveLength(100);
      expect(result.nextCursor).toBe('task-100');
    });

    it('applies custom sort', async () => {
      db.task.findMany.mockResolvedValue([]);

      await caller.tasks.list({ workspaceId: 'ws-1', sortField: 'priority', sortDirection: 'desc' });

      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { priority: 'desc' },
        })
      );
    });

    it('filters by projectId', async () => {
      db.task.findMany.mockResolvedValue([]);

      await caller.tasks.list({ workspaceId: 'ws-1', projectId: 'proj-1' });

      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId: 'proj-1',
          }),
        })
      );
    });

    it('filters by labelId', async () => {
      db.task.findMany.mockResolvedValue([]);

      await caller.tasks.list({ workspaceId: 'ws-1', labelId: ['label-1'] });

      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            labels: { some: { labelId: { in: ['label-1'] } } },
          }),
        })
      );
    });
  });

  describe('get', () => {
    it('returns task with full details', async () => {
      db.task.findUnique.mockResolvedValue(testTask);

      const result = await caller.tasks.get({ id: 'task-1' });

      expect(result).toEqual(testTask);
    });

    it('throws NOT_FOUND for missing task', async () => {
      db.task.findUnique.mockResolvedValue(null);

      await expect(caller.tasks.get({ id: 'nonexistent' })).rejects.toThrow('Task not found');
    });
  });

  describe('update', () => {
    it('updates task and tracks activity', async () => {
      db.task.findUnique.mockResolvedValue({ ...testTask, labels: [] });
      db.task.update.mockResolvedValue({ ...testTask, status: 'IN_PROGRESS' });
      db.activity.create.mockResolvedValue({});

      await caller.tasks.update({ id: 'task-1', status: 'IN_PROGRESS' });

      expect(db.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: { status: 'IN_PROGRESS' },
        })
      );
      expect(db.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: 'task-1',
          action: 'status_changed',
          field: 'status',
          oldValue: 'TODO',
          newValue: 'IN_PROGRESS',
        }),
      });
    });

    it('throws NOT_FOUND for missing task', async () => {
      db.task.findUnique.mockResolvedValue(null);

      await expect(caller.tasks.update({ id: 'nonexistent', title: 'x' })).rejects.toThrow('Task not found');
    });

    it('replaces labels when labelIds provided', async () => {
      db.task.findUnique.mockResolvedValue({ ...testTask, labels: [{ labelId: 'old-label' }] });
      db.taskLabel.deleteMany.mockResolvedValue({});
      db.taskLabel.createMany.mockResolvedValue({});
      db.task.update.mockResolvedValue(testTask);

      await caller.tasks.update({ id: 'task-1', labelIds: ['label-1', 'label-2'] });

      expect(db.taskLabel.deleteMany).toHaveBeenCalledWith({ where: { taskId: 'task-1' } });
      expect(db.taskLabel.createMany).toHaveBeenCalledWith({
        data: [
          { taskId: 'task-1', labelId: 'label-1' },
          { taskId: 'task-1', labelId: 'label-2' },
        ],
      });
    });

    it('notifies on assignee change', async () => {
      db.task.findUnique.mockResolvedValue({ ...testTask, assigneeId: 'user-2', labels: [] });
      db.task.update.mockResolvedValue({ ...testTask, assigneeId: 'user-3', identifier: 'HM-10', title: 'Test' });
      db.activity.create.mockResolvedValue({});
      db.notification.create.mockResolvedValue({});

      await caller.tasks.update({ id: 'task-1', assigneeId: 'user-3' });

      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-3',
          type: 'ASSIGNED',
        }),
      });
    });

    it('notifies blocked task assignees when status moves to DONE', async () => {
      db.task.findUnique.mockResolvedValue({ ...testTask, status: 'IN_REVIEW', labels: [] });
      db.task.update.mockResolvedValue({ ...testTask, status: 'DONE', identifier: 'HM-10' });
      db.activity.create.mockResolvedValue({});
      db.dependency.findMany.mockResolvedValue([
        {
          blockingTaskId: 'task-1',
          blockedTaskId: 'task-2',
          blockedTask: { id: 'task-2', identifier: 'HM-20', assigneeId: 'user-2' },
        },
      ]);
      db.notification.create.mockResolvedValue({});

      await caller.tasks.update({ id: 'task-1', status: 'DONE' });

      expect(db.dependency.findMany).toHaveBeenCalledWith({
        where: { blockingTaskId: 'task-1' },
        include: { blockedTask: true },
      });
      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-2',
          type: 'DEPENDENCY_RESOLVED',
        }),
      });
    });

    it('does not notify DEPENDENCY_RESOLVED for self', async () => {
      db.task.findUnique.mockResolvedValue({ ...testTask, status: 'IN_REVIEW', labels: [] });
      db.task.update.mockResolvedValue({ ...testTask, status: 'DONE', identifier: 'HM-10' });
      db.activity.create.mockResolvedValue({});
      db.dependency.findMany.mockResolvedValue([
        {
          blockingTaskId: 'task-1',
          blockedTaskId: 'task-2',
          blockedTask: { id: 'task-2', identifier: 'HM-20', assigneeId: 'user-1' }, // same as ctx.userId
        },
      ]);

      await caller.tasks.update({ id: 'task-1', status: 'DONE' });

      // Should not create notification for self
      expect(db.notification.create).not.toHaveBeenCalled();
    });

    it('skips activity for unchanged fields', async () => {
      db.task.findUnique.mockResolvedValue({ ...testTask, status: 'TODO', labels: [] });
      db.task.update.mockResolvedValue(testTask);

      await caller.tasks.update({ id: 'task-1', status: 'TODO' }); // same value

      expect(db.activity.create).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('soft deletes by setting status to CANCELLED', async () => {
      db.task.update.mockResolvedValue({ ...testTask, status: 'CANCELLED' });

      await caller.tasks.delete({ id: 'task-1' });

      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'CANCELLED' },
      });
    });
  });
});
