import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

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

import { createMockPrisma, type MockPrisma } from '@/test/helpers/mock-prisma';
import { testUser } from '@/test/helpers/fixtures';
import { dependenciesRouter } from '@/server/trpc/routers/dependencies';

const appRouter = mockRouter({ dependencies: dependenciesRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('dependenciesRouter', () => {
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

  describe('add', () => {
    it('throws BAD_REQUEST when blockingTaskId equals blockedTaskId', async () => {
      await expect(
        caller.dependencies.add({ blockingTaskId: 'task-1', blockedTaskId: 'task-1' })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.dependencies.add({ blockingTaskId: 'task-1', blockedTaskId: 'task-1' })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('throws CONFLICT when dependency already exists', async () => {
      db.dependency.findUnique.mockResolvedValueOnce({
        id: 'dep-1',
        blockingTaskId: 'task-1',
        blockedTaskId: 'task-2',
      });

      await expect(
        caller.dependencies.add({ blockingTaskId: 'task-1', blockedTaskId: 'task-2' })
      ).rejects.toThrow(TRPCError);

      db.dependency.findUnique.mockResolvedValueOnce({
        id: 'dep-1',
        blockingTaskId: 'task-1',
        blockedTaskId: 'task-2',
      });

      await expect(
        caller.dependencies.add({ blockingTaskId: 'task-1', blockedTaskId: 'task-2' })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('detects direct circular dependency: A blocks B, trying B blocks A', async () => {
      // No existing dependency with these exact keys
      db.dependency.findUnique.mockResolvedValueOnce(null);
      // BFS: starting from blockedTaskId='task-1', find deps where blockingTaskId='task-1'
      // This returns task-2 as blocked, meaning task-1 blocks task-2
      // But we're trying to add task-2 blocks task-1, so BFS starts at task-1
      // and finds that task-1 blocks task-2 (blockedTaskId: task-2)
      // Then checks task-2 === blockingTaskId (task-2) → circular!
      db.dependency.findMany.mockResolvedValueOnce([{ blockedTaskId: 'task-2' }]);

      await expect(
        caller.dependencies.add({ blockingTaskId: 'task-2', blockedTaskId: 'task-1' })
      ).rejects.toThrow(TRPCError);

      // Reset and verify code
      db.dependency.findUnique.mockResolvedValueOnce(null);
      db.dependency.findMany.mockResolvedValueOnce([{ blockedTaskId: 'task-2' }]);

      await expect(
        caller.dependencies.add({ blockingTaskId: 'task-2', blockedTaskId: 'task-1' })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('detects longer circular chain: A→B→C, trying C→A', async () => {
      // Trying to add: C (task-3) blocks A (task-1)
      // Existing: A blocks B (task-1 → task-2), B blocks C (task-2 → task-3)
      // BFS starts at blockedTaskId = task-1
      // Queue: [task-1]
      //   task-1: check task-1 === blockingTaskId (task-3)? No
      //   findMany where blockingTaskId=task-1 → [{blockedTaskId: task-2}]
      //   Queue: [task-2]
      //   task-2: check task-2 === task-3? No
      //   findMany where blockingTaskId=task-2 → [{blockedTaskId: task-3}]
      //   Queue: [task-3]
      //   task-3: check task-3 === task-3? Yes → circular!
      db.dependency.findUnique.mockResolvedValueOnce(null);
      db.dependency.findMany
        .mockResolvedValueOnce([{ blockedTaskId: 'task-2' }]) // task-1 blocks task-2
        .mockResolvedValueOnce([{ blockedTaskId: 'task-3' }]); // task-2 blocks task-3

      await expect(
        caller.dependencies.add({ blockingTaskId: 'task-3', blockedTaskId: 'task-1' })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('creates dependency and activity on both tasks', async () => {
      db.dependency.findUnique.mockResolvedValueOnce(null);
      // BFS: no outgoing deps from blockedTaskId
      db.dependency.findMany.mockResolvedValueOnce([]);

      const createdDep = {
        id: 'dep-1',
        blockingTaskId: 'task-1',
        blockedTaskId: 'task-2',
        blockingTask: { id: 'task-1', identifier: 'HM-1', title: 'Task A', status: 'TODO' },
        blockedTask: { id: 'task-2', identifier: 'HM-2', title: 'Task B', status: 'TODO' },
      };
      db.dependency.create.mockResolvedValueOnce(createdDep);
      db.activity.createMany.mockResolvedValueOnce({ count: 2 });

      const result = await caller.dependencies.add({
        blockingTaskId: 'task-1',
        blockedTaskId: 'task-2',
      });

      expect(result).toEqual(createdDep);
      expect(db.dependency.create).toHaveBeenCalledWith({
        data: { blockingTaskId: 'task-1', blockedTaskId: 'task-2' },
        include: {
          blockingTask: { select: { id: true, identifier: true, title: true, status: true } },
          blockedTask: { select: { id: true, identifier: true, title: true, status: true } },
        },
      });
      expect(db.activity.createMany).toHaveBeenCalledWith({
        data: [
          {
            taskId: 'task-1',
            userId: testUser.id,
            action: 'dependency_added',
            field: 'blocking',
            newValue: 'HM-2',
          },
          {
            taskId: 'task-2',
            userId: testUser.id,
            action: 'dependency_added',
            field: 'blockedBy',
            newValue: 'HM-1',
          },
        ],
      });
    });
  });

  describe('remove', () => {
    it('throws NOT_FOUND for missing dependency', async () => {
      db.dependency.findUnique.mockResolvedValueOnce(null);

      await expect(
        caller.dependencies.remove({ id: 'dep-nonexistent' })
      ).rejects.toThrow(TRPCError);

      db.dependency.findUnique.mockResolvedValueOnce(null);

      await expect(
        caller.dependencies.remove({ id: 'dep-nonexistent' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('deletes dependency and creates activity on both tasks', async () => {
      const existingDep = {
        id: 'dep-1',
        blockingTaskId: 'task-1',
        blockedTaskId: 'task-2',
        blockingTask: { id: 'task-1', identifier: 'HM-1' },
        blockedTask: { id: 'task-2', identifier: 'HM-2' },
      };
      db.dependency.findUnique.mockResolvedValueOnce(existingDep);
      db.dependency.delete.mockResolvedValueOnce(existingDep);
      db.activity.createMany.mockResolvedValueOnce({ count: 2 });

      const result = await caller.dependencies.remove({ id: 'dep-1' });

      expect(result).toEqual({ success: true });
      expect(db.dependency.delete).toHaveBeenCalledWith({ where: { id: 'dep-1' } });
      expect(db.activity.createMany).toHaveBeenCalledWith({
        data: [
          {
            taskId: 'task-1',
            userId: testUser.id,
            action: 'dependency_removed',
            field: 'blocking',
            oldValue: 'HM-2',
          },
          {
            taskId: 'task-2',
            userId: testUser.id,
            action: 'dependency_removed',
            field: 'blockedBy',
            oldValue: 'HM-1',
          },
        ],
      });
    });
  });
});
