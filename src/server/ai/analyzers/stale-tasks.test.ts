import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  function model() {
    return {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
      upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(),
      count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn(),
    };
  }
  return {
    mockDb: {
      task: model(), agentInsight: model(), agentConfig: model(),
      workspaceMember: model(), notification: model(),
      $queryRaw: vi.fn(),
    },
  };
});

vi.mock('@/server/db', () => ({ db: mockDb }));
vi.mock('@/server/ai/agent-engine', () => ({
  createInsight: vi.fn(async () => 'insight-id'),
}));

import { analyzeStaleTask } from './stale-tasks';
import { createInsight } from '@/server/ai/agent-engine';

const config = {
  id: 'cfg-1', workspaceId: 'ws-1', staleTaskDays: 5,
  overdueEnabled: true, digestEnabled: true, digestHourUtc: 13,
  duplicateCheck: true, autoUnblock: false, workloadAlerts: true,
  decomposeThreshold: 500, maxInsightsPerDay: 10,
  createdAt: new Date(), updatedAt: new Date(),
};

describe('analyzeStaleTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.task.findMany.mockResolvedValue([]);
  });

  it('returns 0 when no stale tasks', async () => {
    const count = await analyzeStaleTask('ws-1', config);
    expect(count).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
  });

  it('queries IN_PROGRESS/IN_REVIEW tasks older than cutoff', async () => {
    await analyzeStaleTask('ws-1', config);
    expect(mockDb.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workspaceId: 'ws-1',
        status: { in: ['IN_PROGRESS', 'IN_REVIEW'] },
        updatedAt: { lt: expect.any(Date) },
      }),
    }));
  });

  it('creates insight for stale task with assignee', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400_000);
    mockDb.task.findMany.mockResolvedValue([{
      id: 'task-1', identifier: 'HM-1', title: 'Stale work',
      status: 'IN_PROGRESS', assigneeId: 'user-2', projectId: 'proj-1',
      updatedAt: tenDaysAgo,
      assignee: { id: 'user-2', name: 'Bob' },
      activities: [],
    }]);

    const count = await analyzeStaleTask('ws-1', config);

    expect(count).toBe(1);
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      type: 'STALE_TASK',
      targetUserId: 'user-2',
      taskId: 'task-1',
      projectId: 'proj-1',
      proposedAction: {
        type: 'update_task',
        taskId: 'task-1',
        changes: { status: 'TODO' },
      },
      previousState: { status: 'IN_PROGRESS' },
    }));
  });

  it('skips task if recent activity exists', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400_000);
    mockDb.task.findMany.mockResolvedValue([{
      id: 'task-1', identifier: 'HM-1', title: 'Stale work',
      status: 'IN_REVIEW', assigneeId: 'user-2', projectId: null,
      updatedAt: tenDaysAgo,
      assignee: null,
      activities: [{ createdAt: new Date(), action: 'commented' }],
    }]);

    const count = await analyzeStaleTask('ws-1', config);
    expect(count).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
  });

  it('uses higher confidence when very stale (>2x threshold)', async () => {
    const farPast = new Date(Date.now() - 20 * 86400_000); // 20 days > 2 * 5 days
    mockDb.task.findMany.mockResolvedValue([{
      id: 'task-1', identifier: 'HM-1', title: 'Stale',
      status: 'IN_PROGRESS', assigneeId: null, projectId: null,
      updatedAt: farPast, assignee: null, activities: [],
    }]);

    await analyzeStaleTask('ws-1', config);
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      confidence: 0.9,
    }));
  });

  it('handles unassigned tasks', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400_000);
    mockDb.task.findMany.mockResolvedValue([{
      id: 'task-1', identifier: 'HM-1', title: 'Orphaned',
      status: 'IN_PROGRESS', assigneeId: null, projectId: null,
      updatedAt: tenDaysAgo, assignee: null, activities: [],
    }]);

    await analyzeStaleTask('ws-1', config);
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: undefined,
      body: expect.stringContaining('Unassigned'),
    }));
  });

  it('counts only insights that returned an id', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400_000);
    mockDb.task.findMany.mockResolvedValue([
      { id: 't1', identifier: 'HM-1', title: 't1', status: 'IN_PROGRESS', assigneeId: null, projectId: null, updatedAt: tenDaysAgo, assignee: null, activities: [] },
      { id: 't2', identifier: 'HM-2', title: 't2', status: 'IN_PROGRESS', assigneeId: null, projectId: null, updatedAt: tenDaysAgo, assignee: null, activities: [] },
    ]);
    vi.mocked(createInsight).mockResolvedValueOnce('id-1').mockResolvedValueOnce('');

    const count = await analyzeStaleTask('ws-1', config);
    expect(count).toBe(1);
  });
});
