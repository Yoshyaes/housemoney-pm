import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  function model() {
    return {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(),
    };
  }
  return { mockDb: { dependency: model(), task: model(), activity: model() } };
});

vi.mock('@/server/db', () => ({ db: mockDb }));
vi.mock('@/server/ai/agent-engine', () => ({
  createInsight: vi.fn(async () => 'insight-id'),
}));

import { analyzeDependencyChain } from './dependency-chain';
import { createInsight } from '@/server/ai/agent-engine';

function makeDep(overrides: Record<string, unknown> = {}) {
  return {
    blockingTask: { identifier: 'HM-1', title: 'Blocker' },
    blockedTask: {
      id: 'blocked-1',
      identifier: 'HM-2',
      title: 'Blocked task',
      status: 'BACKLOG',
      assigneeId: 'user-2',
      assignee: { id: 'user-2', name: 'Bob' },
      blockedBy: [
        { blockingTask: { id: 'b1', status: 'DONE', identifier: 'HM-1' } },
      ],
      ...overrides,
    },
  };
}

describe('analyzeDependencyChain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.dependency.findMany.mockResolvedValue([]);
    mockDb.task.update.mockResolvedValue({});
    mockDb.activity.create.mockResolvedValue({});
  });

  it('returns 0 when no dependencies', async () => {
    expect(await analyzeDependencyChain('done-task', 'ws-1', false)).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
  });

  it('skips task when other blockers still exist', async () => {
    mockDb.dependency.findMany.mockResolvedValue([
      makeDep({
        blockedBy: [
          { blockingTask: { id: 'b1', status: 'DONE', identifier: 'HM-1' } },
          { blockingTask: { id: 'b2', status: 'IN_PROGRESS', identifier: 'HM-3' } },
        ],
      }),
    ]);

    expect(await analyzeDependencyChain('done-task', 'ws-1', false)).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
  });

  it('treats DONE and CANCELLED blockers as resolved', async () => {
    mockDb.dependency.findMany.mockResolvedValue([
      makeDep({
        blockedBy: [
          { blockingTask: { id: 'b1', status: 'DONE', identifier: 'HM-1' } },
          { blockingTask: { id: 'b2', status: 'CANCELLED', identifier: 'HM-3' } },
        ],
      }),
    ]);

    await analyzeDependencyChain('done-task', 'ws-1', false);
    expect(createInsight).toHaveBeenCalled();
  });

  it('with autoUnblock=true: moves BACKLOG task to TODO and creates insight', async () => {
    mockDb.dependency.findMany.mockResolvedValue([makeDep()]);

    const count = await analyzeDependencyChain('done-task', 'ws-1', true);

    expect(mockDb.task.update).toHaveBeenCalledWith({
      where: { id: 'blocked-1' },
      data: { status: 'TODO' },
    });
    expect(mockDb.activity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'ai_auto_unblock',
        field: 'status',
        oldValue: 'BACKLOG',
        newValue: 'TODO',
      }),
    }));
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DEPENDENCY_UNBLOCKED',
      title: expect.stringContaining('HM-2'),
      proposedAction: expect.objectContaining({
        type: 'update_task',
        taskId: 'blocked-1',
        changes: { status: 'TODO' },
      }),
    }));
    expect(count).toBe(1);
  });

  it('with autoUnblock=false: notifies but does NOT update task', async () => {
    mockDb.dependency.findMany.mockResolvedValue([makeDep()]);

    await analyzeDependencyChain('done-task', 'ws-1', false);

    expect(mockDb.task.update).not.toHaveBeenCalled();
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DEPENDENCY_UNBLOCKED',
      proposedAction: expect.objectContaining({
        type: 'update_task',
        changes: { status: 'TODO' },
      }),
    }));
  });

  it('autoUnblock=false with non-BACKLOG status: no proposedAction', async () => {
    mockDb.dependency.findMany.mockResolvedValue([
      makeDep({ status: 'TODO' }),
    ]);

    await analyzeDependencyChain('done-task', 'ws-1', false);

    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      proposedAction: undefined,
      previousState: undefined,
    }));
  });

  it('does not auto-update task that is not BACKLOG/TODO', async () => {
    mockDb.dependency.findMany.mockResolvedValue([
      makeDep({ status: 'IN_PROGRESS' }),
    ]);

    // autoUnblock=true, but task is IN_PROGRESS — falls to else branch
    await analyzeDependencyChain('done-task', 'ws-1', true);

    expect(mockDb.task.update).not.toHaveBeenCalled();
    expect(createInsight).toHaveBeenCalled();
  });

  it('handles tasks with no assignee', async () => {
    mockDb.dependency.findMany.mockResolvedValue([
      makeDep({ assigneeId: null, assignee: null }),
    ]);

    await analyzeDependencyChain('done-task', 'ws-1', true);
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: undefined,
    }));
  });
});
