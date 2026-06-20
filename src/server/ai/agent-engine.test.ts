import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn() },
  })),
}));

// Mock db before importing agent-engine (it imports `db` at top-level).
// Use vi.hoisted so mockDb is created before vi.mock factories run.
const { mockDb } = vi.hoisted(() => {
  function createModelMock() {
    return {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    };
  }
  const db = {
    user: createModelMock(),
    workspace: createModelMock(),
    workspaceMember: createModelMock(),
    project: createModelMock(),
    projectMember: createModelMock(),
    task: createModelMock(),
    taskLabel: createModelMock(),
    label: createModelMock(),
    comment: createModelMock(),
    activity: createModelMock(),
    dependency: createModelMock(),
    notification: createModelMock(),
    document: createModelMock(),
    documentChunk: createModelMock(),
    agentInsight: createModelMock(),
    agentConfig: createModelMock(),
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
  };
  return { mockDb: db };
});

vi.mock('@/server/db', () => ({
  db: mockDb,
}));

// Mock all analyzers since we only test orchestration here
vi.mock('@/server/ai/analyzers/stale-tasks', () => ({
  analyzeStaleTask: vi.fn(async () => 0),
}));
vi.mock('@/server/ai/analyzers/overdue-tasks', () => ({
  analyzeOverdueTasks: vi.fn(async () => 0),
}));
vi.mock('@/server/ai/analyzers/dependency-chain', () => ({
  analyzeDependencyChain: vi.fn(async () => 0),
}));
vi.mock('@/server/ai/analyzers/duplicate-detector', () => ({
  detectDuplicates: vi.fn(async () => 0),
}));
vi.mock('@/server/ai/analyzers/daily-digest', () => ({
  generateDailyDigest: vi.fn(async () => 0),
}));
vi.mock('@/server/ai/analyzers/workload-balance', () => ({
  analyzeWorkloadBalance: vi.fn(async () => 0),
}));
vi.mock('@/server/ai/analyzers/task-decomposer', () => ({
  suggestDecomposition: vi.fn(async () => 0),
}));
vi.mock('@/server/ai/analyzers/meeting-notes', () => ({
  extractMeetingActions: vi.fn(async () => 0),
}));

import {
  createInsight,
  applyInsightAction,
  revertInsightAction,
  runPeriodicAnalysis,
  handleTaskCreated,
  handleTaskCompleted,
  handleMeetingNotesSaved,
} from './agent-engine';
import { analyzeStaleTask } from './analyzers/stale-tasks';
import { analyzeOverdueTasks } from './analyzers/overdue-tasks';
import { analyzeDependencyChain } from './analyzers/dependency-chain';
import { detectDuplicates } from './analyzers/duplicate-detector';
import { generateDailyDigest } from './analyzers/daily-digest';
import { analyzeWorkloadBalance } from './analyzers/workload-balance';
import { suggestDecomposition } from './analyzers/task-decomposer';
import { extractMeetingActions } from './analyzers/meeting-notes';

const defaultConfig = {
  id: 'cfg-1',
  workspaceId: 'ws-1',
  staleTaskDays: 5,
  overdueEnabled: true,
  digestEnabled: true,
  digestHourUtc: 13,
  duplicateCheck: true,
  autoUnblock: false,
  workloadAlerts: true,
  decomposeThreshold: 500,
  maxInsightsPerDay: 10,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function resetMockDb() {
  for (const value of Object.values(mockDb)) {
    if (typeof value === 'object' && value !== null) {
      for (const fn of Object.values(value)) {
        if (typeof fn === 'function' && 'mockReset' in fn) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    } else if (typeof value === 'function' && 'mockReset' in value) {
      (value as ReturnType<typeof vi.fn>).mockReset();
    }
  }
}

describe('agent-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDb();
    // Default agentConfig
    mockDb.agentConfig.findUnique.mockResolvedValue(defaultConfig);
    mockDb.agentInsight.count.mockResolvedValue(0);
    mockDb.agentInsight.findFirst.mockResolvedValue(null);
    mockDb.agentInsight.create.mockResolvedValue({ id: 'insight-1' });
    mockDb.workspaceMember.findFirst.mockResolvedValue({ userId: 'admin-1' });
    mockDb.notification.create.mockResolvedValue({ id: 'notif-1' });
  });

  describe('createInsight', () => {
    it('persists insight via Prisma and returns id', async () => {
      const id = await createInsight({
        workspaceId: 'ws-1',
        type: 'STALE_TASK',
        title: 'Task is stale',
        body: 'Has not been updated',
        taskId: 'task-1',
      });

      expect(id).toBe('insight-1');
      expect(mockDb.agentInsight.create).toHaveBeenCalledTimes(1);
      const createArgs = mockDb.agentInsight.create.mock.calls[0][0];
      expect(createArgs.data).toMatchObject({
        workspaceId: 'ws-1',
        type: 'STALE_TASK',
        title: 'Task is stale',
        body: 'Has not been updated',
        taskId: 'task-1',
        confidence: 0.5, // default
      });
      expect(createArgs.data.expiresAt).toBeInstanceOf(Date);
    });

    it('auto-creates AgentConfig if missing', async () => {
      mockDb.agentConfig.findUnique.mockResolvedValue(null);
      mockDb.agentConfig.create.mockResolvedValue(defaultConfig);

      await createInsight({
        workspaceId: 'ws-1',
        type: 'STALE_TASK',
        title: 'Title',
        body: 'Body',
      });

      expect(mockDb.agentConfig.create).toHaveBeenCalledWith({
        data: { workspaceId: 'ws-1' },
      });
    });

    it('returns empty string when daily insight limit reached', async () => {
      mockDb.agentInsight.count.mockResolvedValue(defaultConfig.maxInsightsPerDay);

      const id = await createInsight({
        workspaceId: 'ws-1',
        type: 'STALE_TASK',
        title: 'Title',
        body: 'Body',
      });

      expect(id).toBe('');
      expect(mockDb.agentInsight.create).not.toHaveBeenCalled();
    });

    it('dedups: returns existing id when same type+task within 24h', async () => {
      mockDb.agentInsight.findFirst.mockResolvedValue({ id: 'existing-insight' });

      const id = await createInsight({
        workspaceId: 'ws-1',
        type: 'STALE_TASK',
        title: 'Title',
        body: 'Body',
        taskId: 'task-1',
      });

      expect(id).toBe('existing-insight');
      expect(mockDb.agentInsight.create).not.toHaveBeenCalled();
    });

    it('does not dedup when taskId is missing', async () => {
      mockDb.agentInsight.findFirst.mockResolvedValue({ id: 'existing' });

      await createInsight({
        workspaceId: 'ws-1',
        type: 'DAILY_DIGEST',
        title: 'Digest',
        body: 'Body',
      });

      // Should still create — findFirst dedup check only runs when taskId exists
      expect(mockDb.agentInsight.create).toHaveBeenCalled();
    });

    it('creates notification for targetUserId when admin exists', async () => {
      await createInsight({
        workspaceId: 'ws-1',
        type: 'STALE_TASK',
        title: 'Title',
        body: 'Body',
        targetUserId: 'user-2',
        taskId: 'task-1',
      });

      expect(mockDb.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          type: 'AI_INSIGHT',
          taskId: 'task-1',
          actorId: 'admin-1',
          message: 'Title',
        },
      });
    });

    it('skips notification when no admin found', async () => {
      mockDb.workspaceMember.findFirst.mockResolvedValue(null);

      await createInsight({
        workspaceId: 'ws-1',
        type: 'STALE_TASK',
        title: 'Title',
        body: 'Body',
        targetUserId: 'user-2',
      });

      expect(mockDb.notification.create).not.toHaveBeenCalled();
    });

    it('skips notification when no targetUserId', async () => {
      await createInsight({
        workspaceId: 'ws-1',
        type: 'STALE_TASK',
        title: 'Title',
        body: 'Body',
      });

      expect(mockDb.notification.create).not.toHaveBeenCalled();
    });

    it('uses provided confidence and expiresAt', async () => {
      const customExpiry = new Date('2030-01-01');
      await createInsight({
        workspaceId: 'ws-1',
        type: 'STALE_TASK',
        title: 'Title',
        body: 'Body',
        confidence: 0.95,
        expiresAt: customExpiry,
      });

      const createArgs = mockDb.agentInsight.create.mock.calls[0][0];
      expect(createArgs.data.confidence).toBe(0.95);
      expect(createArgs.data.expiresAt).toBe(customExpiry);
    });
  });

  describe('applyInsightAction', () => {
    it('returns false when insight not found', async () => {
      mockDb.agentInsight.findUnique.mockResolvedValue(null);
      expect(await applyInsightAction('missing')).toBe(false);
    });

    it('returns false when insight not PENDING', async () => {
      mockDb.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1',
        status: 'ACCEPTED',
        proposedAction: null,
      });
      expect(await applyInsightAction('i-1')).toBe(false);
    });

    it('marks ACCEPTED when no proposedAction', async () => {
      mockDb.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1',
        status: 'PENDING',
        proposedAction: null,
      });
      mockDb.agentInsight.update.mockResolvedValue({ id: 'i-1' });

      const ok = await applyInsightAction('i-1');
      expect(ok).toBe(true);
      expect(mockDb.agentInsight.update).toHaveBeenCalledWith({
        where: { id: 'i-1' },
        data: { status: 'ACCEPTED', actedAt: expect.any(Date) },
      });
    });

    it('applies update_task action and saves previous state', async () => {
      mockDb.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1',
        status: 'PENDING',
        targetUserId: 'user-1',
        proposedAction: {
          type: 'update_task',
          taskId: 'task-1',
          changes: { status: 'TODO', priority: 'HIGH' },
        },
      });
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: 'BACKLOG',
        priority: 'LOW',
        title: 'A task',
      });
      mockDb.task.update.mockResolvedValue({});
      mockDb.agentInsight.update.mockResolvedValue({});
      mockDb.activity.create.mockResolvedValue({});

      const ok = await applyInsightAction('i-1');
      expect(ok).toBe(true);

      expect(mockDb.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'TODO', priority: 'HIGH' },
      });

      const insightUpdateArgs = mockDb.agentInsight.update.mock.calls[0][0];
      expect(insightUpdateArgs.data.status).toBe('ACCEPTED');
      expect(insightUpdateArgs.data.previousState).toEqual({
        status: 'BACKLOG',
        priority: 'LOW',
      });

      expect(mockDb.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: 'task-1',
          userId: 'user-1',
          action: 'ai_suggestion_applied',
          field: 'status, priority',
        }),
      });
    });

    it('returns false when target task missing for update_task', async () => {
      mockDb.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1',
        status: 'PENDING',
        proposedAction: {
          type: 'update_task',
          taskId: 'task-1',
          changes: { status: 'TODO' },
        },
      });
      mockDb.task.findUnique.mockResolvedValue(null);

      expect(await applyInsightAction('i-1')).toBe(false);
      expect(mockDb.task.update).not.toHaveBeenCalled();
    });

    it('accepts unknown action types without erroring', async () => {
      mockDb.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1',
        status: 'PENDING',
        proposedAction: { type: 'something_else' },
      });
      mockDb.agentInsight.update.mockResolvedValue({});

      expect(await applyInsightAction('i-1')).toBe(true);
      expect(mockDb.agentInsight.update).toHaveBeenCalled();
    });
  });

  describe('revertInsightAction', () => {
    it('returns false when not found', async () => {
      mockDb.agentInsight.findUnique.mockResolvedValue(null);
      expect(await revertInsightAction('x')).toBe(false);
    });

    it('returns false when status is not ACCEPTED or AUTO_APPLIED', async () => {
      mockDb.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1',
        status: 'PENDING',
        proposedAction: null,
        previousState: null,
      });
      expect(await revertInsightAction('i-1')).toBe(false);
    });

    it('reverts update_task by writing previousState back', async () => {
      mockDb.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1',
        status: 'ACCEPTED',
        proposedAction: {
          type: 'update_task',
          taskId: 'task-1',
          changes: { status: 'TODO' },
        },
        previousState: { status: 'BACKLOG' },
      });
      mockDb.task.update.mockResolvedValue({});
      mockDb.agentInsight.update.mockResolvedValue({});

      expect(await revertInsightAction('i-1')).toBe(true);
      expect(mockDb.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'BACKLOG' },
      });
      expect(mockDb.agentInsight.update).toHaveBeenCalledWith({
        where: { id: 'i-1' },
        data: { status: 'REVERTED', actedAt: expect.any(Date) },
      });
    });

    it('marks REVERTED even without task update if no previousState', async () => {
      mockDb.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1',
        status: 'AUTO_APPLIED',
        proposedAction: null,
        previousState: null,
      });
      mockDb.agentInsight.update.mockResolvedValue({});

      expect(await revertInsightAction('i-1')).toBe(true);
      expect(mockDb.task.update).not.toHaveBeenCalled();
    });
  });

  describe('runPeriodicAnalysis', () => {
    it('15min: runs stale + overdue analyzers when enabled', async () => {
      vi.mocked(analyzeStaleTask).mockResolvedValue(2);
      vi.mocked(analyzeOverdueTasks).mockResolvedValue(1);

      const total = await runPeriodicAnalysis('ws-1', '15min');

      expect(analyzeStaleTask).toHaveBeenCalledWith('ws-1', defaultConfig);
      expect(analyzeOverdueTasks).toHaveBeenCalledWith('ws-1');
      expect(generateDailyDigest).not.toHaveBeenCalled();
      expect(analyzeWorkloadBalance).not.toHaveBeenCalled();
      expect(total).toBe(3);
    });

    it('15min: skips overdue when disabled', async () => {
      mockDb.agentConfig.findUnique.mockResolvedValue({ ...defaultConfig, overdueEnabled: false });
      vi.mocked(analyzeStaleTask).mockResolvedValue(0);

      await runPeriodicAnalysis('ws-1', '15min');

      expect(analyzeStaleTask).toHaveBeenCalled();
      expect(analyzeOverdueTasks).not.toHaveBeenCalled();
    });

    it('daily: runs stale, overdue AND digest', async () => {
      vi.mocked(analyzeStaleTask).mockResolvedValue(1);
      vi.mocked(analyzeOverdueTasks).mockResolvedValue(2);
      vi.mocked(generateDailyDigest).mockResolvedValue(3);

      const total = await runPeriodicAnalysis('ws-1', 'daily');

      expect(generateDailyDigest).toHaveBeenCalledWith('ws-1');
      expect(total).toBe(6);
    });

    it('daily: skips digest when disabled', async () => {
      mockDb.agentConfig.findUnique.mockResolvedValue({ ...defaultConfig, digestEnabled: false });
      await runPeriodicAnalysis('ws-1', 'daily');
      expect(generateDailyDigest).not.toHaveBeenCalled();
    });

    it('weekly: runs workload balance when enabled', async () => {
      vi.mocked(analyzeWorkloadBalance).mockResolvedValue(5);
      const total = await runPeriodicAnalysis('ws-1', 'weekly');
      expect(analyzeWorkloadBalance).toHaveBeenCalledWith('ws-1');
      expect(total).toBe(5);
    });

    it('weekly: skips workload when disabled', async () => {
      mockDb.agentConfig.findUnique.mockResolvedValue({ ...defaultConfig, workloadAlerts: false });
      const total = await runPeriodicAnalysis('ws-1', 'weekly');
      expect(analyzeWorkloadBalance).not.toHaveBeenCalled();
      expect(total).toBe(0);
    });

    it('does not crash when AgentConfig is missing — auto-creates it', async () => {
      mockDb.agentConfig.findUnique.mockResolvedValue(null);
      mockDb.agentConfig.create.mockResolvedValue(defaultConfig);

      await expect(runPeriodicAnalysis('ws-1', '15min')).resolves.toBeDefined();
      expect(mockDb.agentConfig.create).toHaveBeenCalled();
    });
  });

  describe('handleTaskCreated', () => {
    it('runs duplicate detection when enabled', async () => {
      mockDb.task.findUnique.mockResolvedValue({ description: 'a'.repeat(100) });

      await handleTaskCreated('task-1', 'ws-1');

      expect(detectDuplicates).toHaveBeenCalledWith('task-1', 'ws-1');
    });

    it('skips duplicate detection when disabled', async () => {
      mockDb.agentConfig.findUnique.mockResolvedValue({ ...defaultConfig, duplicateCheck: false });
      mockDb.task.findUnique.mockResolvedValue({ description: null });

      await handleTaskCreated('task-1', 'ws-1');

      expect(detectDuplicates).not.toHaveBeenCalled();
    });

    it('suggests decomposition when description exceeds threshold', async () => {
      mockDb.task.findUnique.mockResolvedValue({ description: 'x'.repeat(600) });

      await handleTaskCreated('task-1', 'ws-1');

      expect(suggestDecomposition).toHaveBeenCalledWith('task-1', 'ws-1');
    });

    it('skips decomposition when description is short', async () => {
      mockDb.task.findUnique.mockResolvedValue({ description: 'short' });

      await handleTaskCreated('task-1', 'ws-1');

      expect(suggestDecomposition).not.toHaveBeenCalled();
    });

    it('does not throw when analyzers reject', async () => {
      vi.mocked(detectDuplicates).mockRejectedValue(new Error('boom'));
      vi.mocked(suggestDecomposition).mockRejectedValue(new Error('boom'));
      mockDb.task.findUnique.mockResolvedValue({ description: 'x'.repeat(600) });

      await expect(handleTaskCreated('task-1', 'ws-1')).resolves.toBeUndefined();
    });
  });

  describe('handleTaskCompleted', () => {
    it('runs dependency-chain analyzer with autoUnblock flag', async () => {
      mockDb.agentConfig.findUnique.mockResolvedValue({ ...defaultConfig, autoUnblock: true });

      await handleTaskCompleted('task-1', 'ws-1');

      expect(analyzeDependencyChain).toHaveBeenCalledWith('task-1', 'ws-1', true);
    });

    it('passes autoUnblock=false by default', async () => {
      await handleTaskCompleted('task-1', 'ws-1');
      expect(analyzeDependencyChain).toHaveBeenCalledWith('task-1', 'ws-1', false);
    });

    it('does not throw when analyzer rejects', async () => {
      vi.mocked(analyzeDependencyChain).mockRejectedValue(new Error('boom'));
      await expect(handleTaskCompleted('task-1', 'ws-1')).resolves.toBeUndefined();
    });
  });

  describe('handleMeetingNotesSaved', () => {
    it('runs meeting notes analyzer', async () => {
      await handleMeetingNotesSaved('doc-1', 'ws-1');
      expect(extractMeetingActions).toHaveBeenCalledWith('doc-1', 'ws-1');
    });

    it('does not throw when analyzer rejects', async () => {
      vi.mocked(extractMeetingActions).mockRejectedValue(new Error('boom'));
      await expect(handleMeetingNotesSaved('doc-1', 'ws-1')).resolves.toBeUndefined();
    });
  });
});
