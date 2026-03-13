import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const mocks = vi.hoisted(() => ({
  task: { findUnique: vi.fn(), update: vi.fn() },
  gitHubPR: { upsert: vi.fn(), updateMany: vi.fn() },
  activity: { create: vi.fn() },
}));

vi.mock('@/server/db', () => ({
  db: mocks,
}));

import { POST } from './route';

const mockTask = mocks.task;
const mockGitHubPR = mocks.gitHubPR;
const mockActivity = mocks.activity;

function sign(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function createRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/github/webhook', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

describe('GitHub webhook route', () => {
  const secret = 'test-secret';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_WEBHOOK_SECRET = secret;
  });

  describe('HMAC verification', () => {
    it('returns 401 when signature header is missing', async () => {
      const req = createRequest('{}', { 'x-github-event': 'pull_request' });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 when secret is not configured', async () => {
      delete process.env.GITHUB_WEBHOOK_SECRET;
      const body = '{}';
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
        'x-github-event': 'pull_request',
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 for invalid signature', async () => {
      const body = '{}';
      const req = createRequest(body, {
        'x-hub-signature-256': 'sha256=invalidsignature0000000000000000000000000000000000000000000000',
        'x-github-event': 'pull_request',
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it('skips non-pull_request events', async () => {
      const body = '{}';
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
        'x-github-event': 'push',
      });
      const res = await POST(req);
      const data = await res.json();
      expect(data).toEqual({ ok: true, skipped: true });
    });

    it('returns linked: 0 when no task identifiers found', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          id: 123,
          number: 1,
          title: 'Fix something',
          body: 'No task refs',
          html_url: 'https://github.com/test/repo/pull/1',
          user: { login: 'dev', avatar_url: 'https://example.com/avatar' },
        },
        repository: { full_name: 'test/repo' },
      };
      const body = JSON.stringify(payload);
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
        'x-github-event': 'pull_request',
      });
      const res = await POST(req);
      const data = await res.json();
      expect(data).toEqual({ ok: true, linked: 0 });
    });

    it('links PR to task and auto-transitions TODO to IN_REVIEW on opened', async () => {
      const task = {
        id: 'task-1',
        identifier: 'HM-42',
        status: 'TODO',
        createdById: 'user-1',
      };
      mockTask.findUnique.mockResolvedValue(task);
      mockGitHubPR.upsert.mockResolvedValue({});
      mockTask.update.mockResolvedValue({ ...task, status: 'IN_REVIEW' });
      mockActivity.create.mockResolvedValue({});

      const payload = {
        action: 'opened',
        pull_request: {
          id: 456,
          number: 10,
          title: 'HM-42 Fix login bug',
          body: '',
          html_url: 'https://github.com/test/repo/pull/10',
          user: { login: 'dev', avatar_url: 'https://example.com/avatar' },
        },
        repository: { full_name: 'test/repo' },
      };
      const body = JSON.stringify(payload);
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
        'x-github-event': 'pull_request',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data).toEqual({ ok: true, linked: 1 });
      expect(mockGitHubPR.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { githubId: 456 },
          create: expect.objectContaining({ taskId: 'task-1', status: 'OPEN' }),
        })
      );
      expect(mockTask.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'IN_REVIEW' },
      });
      expect(mockActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'status_changed',
          oldValue: 'TODO',
          newValue: 'IN_REVIEW',
        }),
      });
    });

    it('transitions to DONE on merged PR close', async () => {
      const task = {
        id: 'task-1',
        identifier: 'HM-15',
        status: 'IN_REVIEW',
        createdById: 'user-1',
      };
      mockTask.findUnique.mockResolvedValue(task);
      mockGitHubPR.updateMany.mockResolvedValue({});
      mockTask.update.mockResolvedValue({ ...task, status: 'DONE' });
      mockActivity.create.mockResolvedValue({});

      const payload = {
        action: 'closed',
        pull_request: {
          id: 789,
          number: 5,
          title: 'HM-15 Complete feature',
          body: '',
          merged: true,
          html_url: 'https://github.com/test/repo/pull/5',
          user: { login: 'dev', avatar_url: 'https://example.com/avatar' },
        },
        repository: { full_name: 'test/repo' },
      };
      const body = JSON.stringify(payload);
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
        'x-github-event': 'pull_request',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data).toEqual({ ok: true, linked: 1 });
      expect(mockGitHubPR.updateMany).toHaveBeenCalledWith({
        where: { githubId: 789 },
        data: { status: 'MERGED' },
      });
      expect(mockTask.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'DONE' },
      });
    });

    it('sets CLOSED status on non-merged PR close', async () => {
      const task = {
        id: 'task-1',
        identifier: 'HM-15',
        status: 'IN_REVIEW',
        createdById: 'user-1',
      };
      mockTask.findUnique.mockResolvedValue(task);
      mockGitHubPR.updateMany.mockResolvedValue({});

      const payload = {
        action: 'closed',
        pull_request: {
          id: 789,
          number: 5,
          title: 'HM-15 Abandoned PR',
          body: '',
          merged: false,
          html_url: 'https://github.com/test/repo/pull/5',
          user: { login: 'dev', avatar_url: 'https://example.com/avatar' },
        },
        repository: { full_name: 'test/repo' },
      };
      const body = JSON.stringify(payload);
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
        'x-github-event': 'pull_request',
      });

      await POST(req);

      expect(mockGitHubPR.updateMany).toHaveBeenCalledWith({
        where: { githubId: 789 },
        data: { status: 'CLOSED' },
      });
      expect(mockTask.update).not.toHaveBeenCalled();
    });

    it('extracts multiple task identifiers and deduplicates', async () => {
      mockTask.findUnique.mockResolvedValue(null);

      const payload = {
        action: 'opened',
        pull_request: {
          id: 100,
          number: 1,
          title: 'HM-1 and HM-2',
          body: 'Also references HM-1 again and HM-3',
          html_url: 'https://github.com/test/repo/pull/1',
          user: { login: 'dev', avatar_url: 'https://example.com/avatar' },
        },
        repository: { full_name: 'test/repo' },
      };
      const body = JSON.stringify(payload);
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
        'x-github-event': 'pull_request',
      });

      await POST(req);

      // Should deduplicate: HM-1, HM-2, HM-3 (3 unique)
      expect(mockTask.findUnique).toHaveBeenCalledTimes(3);
    });

    it('does not transition BACKLOG task status on PR open', async () => {
      const task = {
        id: 'task-1',
        identifier: 'HM-5',
        status: 'BACKLOG',
        createdById: 'user-1',
      };
      mockTask.findUnique.mockResolvedValue(task);
      mockGitHubPR.upsert.mockResolvedValue({});

      const payload = {
        action: 'opened',
        pull_request: {
          id: 200,
          number: 2,
          title: 'HM-5 something',
          body: '',
          html_url: 'https://github.com/test/repo/pull/2',
          user: { login: 'dev', avatar_url: 'https://example.com/avatar' },
        },
        repository: { full_name: 'test/repo' },
      };
      const body = JSON.stringify(payload);
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
        'x-github-event': 'pull_request',
      });

      await POST(req);

      expect(mockTask.update).not.toHaveBeenCalled();
    });
  });
});
