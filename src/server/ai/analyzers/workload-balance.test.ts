import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  function model() {
    return {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(), count: vi.fn(),
    };
  }
  return { mockDb: { workspaceMember: model(), task: model() } };
});

vi.mock('@/server/db', () => ({ db: mockDb }));
vi.mock('@/server/ai/agent-engine', () => ({
  createInsight: vi.fn(async () => 'insight-id'),
}));

import { analyzeWorkloadBalance } from './workload-balance';
import { createInsight } from '@/server/ai/agent-engine';

describe('analyzeWorkloadBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 if fewer than 2 non-guest members', async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      { userId: 'user-1', role: 'ADMIN', user: { id: 'user-1', name: 'Alice' } },
    ]);

    expect(await analyzeWorkloadBalance('ws-1')).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
  });

  it('excludes guests from workload analysis', async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([]);

    await analyzeWorkloadBalance('ws-1');

    expect(mockDb.workspaceMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'ws-1', role: { not: 'GUEST' } },
    }));
  });

  it('returns 0 when workloads are balanced (low stdDev)', async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      { userId: 'u1', role: 'MEMBER', user: { id: 'u1', name: 'A' } },
      { userId: 'u2', role: 'MEMBER', user: { id: 'u2', name: 'B' } },
      { userId: 'u3', role: 'MEMBER', user: { id: 'u3', name: 'C' } },
    ]);
    mockDb.task.count.mockResolvedValueOnce(5).mockResolvedValueOnce(5).mockResolvedValueOnce(5);

    expect(await analyzeWorkloadBalance('ws-1')).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
  });

  it('flags overloaded members (>2 std devs above mean)', async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      { userId: 'admin-1', role: 'ADMIN', user: { id: 'admin-1', name: 'Admin' } },
      { userId: 'u1', role: 'MEMBER', user: { id: 'u1', name: 'Alice' } },
      { userId: 'u2', role: 'MEMBER', user: { id: 'u2', name: 'Bob' } },
      { userId: 'u3', role: 'MEMBER', user: { id: 'u3', name: 'Carol' } },
      { userId: 'u4', role: 'MEMBER', user: { id: 'u4', name: 'Dave' } },
      { userId: 'u5', role: 'MEMBER', user: { id: 'u5', name: 'Eve' } },
    ]);
    // Counts: admin=0, u1=0, u2=0, u3=0, u4=0, u5=30
    // mean = 5, var = (25*5 + 625)/6 = 125, sd ≈ 11.18, mean+2sd ≈ 27.36
    // u5's 30 > 27.36, so u5 is flagged
    mockDb.task.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(30);

    const count = await analyzeWorkloadBalance('ws-1');

    expect(count).toBe(1);
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      type: 'WORKLOAD_IMBALANCE',
      targetUserId: 'admin-1', // routed to admin
      title: expect.stringContaining('Eve'),
      body: expect.stringContaining('Workload imbalance detected'),
    }));
  });

  it('routes to heavy member if no admin exists', async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      { userId: 'u1', role: 'MEMBER', user: { id: 'u1', name: 'A' } },
      { userId: 'u2', role: 'MEMBER', user: { id: 'u2', name: 'B' } },
      { userId: 'u3', role: 'MEMBER', user: { id: 'u3', name: 'C' } },
      { userId: 'u4', role: 'MEMBER', user: { id: 'u4', name: 'D' } },
      { userId: 'u5', role: 'MEMBER', user: { id: 'u5', name: 'E' } },
      { userId: 'u6', role: 'MEMBER', user: { id: 'u6', name: 'F' } },
    ]);
    // Same distribution: zeros + one 30 → flagged. No admin in list.
    mockDb.task.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(30);

    await analyzeWorkloadBalance('ws-1');

    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: 'u6', // overloaded member when no admin
    }));
  });

  it('queries only TODO/IN_PROGRESS/IN_REVIEW tasks per member', async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      { userId: 'u1', role: 'MEMBER', user: { id: 'u1', name: 'A' } },
      { userId: 'u2', role: 'MEMBER', user: { id: 'u2', name: 'B' } },
    ]);
    mockDb.task.count.mockResolvedValue(0);

    await analyzeWorkloadBalance('ws-1');

    expect(mockDb.task.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workspaceId: 'ws-1',
        assigneeId: 'u1',
        status: { in: ['TODO', 'IN_PROGRESS', 'IN_REVIEW'] },
      }),
    }));
  });
});
