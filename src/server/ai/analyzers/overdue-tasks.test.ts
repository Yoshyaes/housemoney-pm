import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  function model() {
    return {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(), count: vi.fn(),
    };
  }
  return { mockDb: { task: model() } };
});

vi.mock('@/server/db', () => ({ db: mockDb }));
vi.mock('@/server/ai/agent-engine', () => ({
  createInsight: vi.fn(async () => 'insight-id'),
}));

import { analyzeOverdueTasks } from './overdue-tasks';
import { createInsight } from '@/server/ai/agent-engine';

describe('analyzeOverdueTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.task.findMany.mockResolvedValue([]);
  });

  it('returns 0 when no overdue tasks', async () => {
    expect(await analyzeOverdueTasks('ws-1')).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
  });

  it('queries tasks with dueDate < now and active status', async () => {
    await analyzeOverdueTasks('ws-1');
    expect(mockDb.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workspaceId: 'ws-1',
        dueDate: { lt: expect.any(Date) },
        status: { notIn: ['DONE', 'CANCELLED'] },
      }),
      orderBy: { dueDate: 'asc' },
    }));
  });

  it('creates insight with moderate severity for 1-3 days overdue', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400_000);
    mockDb.task.findMany.mockResolvedValue([{
      id: 'task-1', identifier: 'HM-1', title: 'Late',
      status: 'TODO', dueDate: twoDaysAgo,
      assigneeId: 'user-2', projectId: 'proj-1',
      assignee: { id: 'user-2', name: 'Bob' },
      project: { id: 'proj-1', name: 'API' },
    }]);

    await analyzeOverdueTasks('ws-1');

    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      type: 'OVERDUE_ESCALATION',
      targetUserId: 'user-2',
      taskId: 'task-1',
      projectId: 'proj-1',
      confidence: 0.7,
      body: expect.stringContaining('moderate'),
    }));
  });

  it('uses high severity for 4-7 days overdue', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400_000);
    mockDb.task.findMany.mockResolvedValue([{
      id: 't1', identifier: 'HM-1', title: 't1', status: 'TODO', dueDate: fiveDaysAgo,
      assigneeId: null, projectId: null, assignee: null, project: null,
    }]);

    await analyzeOverdueTasks('ws-1');
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      confidence: 0.85,
      body: expect.stringContaining('high'),
    }));
  });

  it('uses critical severity for >7 days overdue', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400_000);
    mockDb.task.findMany.mockResolvedValue([{
      id: 't1', identifier: 'HM-1', title: 't1', status: 'TODO', dueDate: tenDaysAgo,
      assigneeId: null, projectId: null, assignee: null, project: null,
    }]);

    await analyzeOverdueTasks('ws-1');
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      confidence: 0.95,
      body: expect.stringContaining('critical'),
    }));
  });

  it('handles unassigned tasks', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400_000);
    mockDb.task.findMany.mockResolvedValue([{
      id: 't1', identifier: 'HM-1', title: 'Orphan', status: 'TODO', dueDate: twoDaysAgo,
      assigneeId: null, projectId: null, assignee: null, project: null,
    }]);

    await analyzeOverdueTasks('ws-1');
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: undefined,
      body: expect.stringContaining('Unassigned'),
    }));
  });

  it('returns count of successfully created insights', async () => {
    const ago = new Date(Date.now() - 3 * 86400_000);
    mockDb.task.findMany.mockResolvedValue([
      { id: 't1', identifier: 'HM-1', title: 't1', status: 'TODO', dueDate: ago, assigneeId: null, projectId: null, assignee: null, project: null },
      { id: 't2', identifier: 'HM-2', title: 't2', status: 'TODO', dueDate: ago, assigneeId: null, projectId: null, assignee: null, project: null },
    ]);
    vi.mocked(createInsight).mockResolvedValueOnce('id-1').mockResolvedValueOnce('');

    const count = await analyzeOverdueTasks('ws-1');
    expect(count).toBe(1);
  });
});
