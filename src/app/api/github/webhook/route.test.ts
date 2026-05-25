import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  describe('HMAC verification — additional cases', () => {
    it('returns 401 for signature of wrong length (no constant-time compare on diff lengths)', async () => {
      const body = '{}';
      const req = createRequest(body, {
        'x-hub-signature-256': 'sha256=tooshort',
        'x-github-event': 'pull_request',
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 for signature signed with a different secret', async () => {
      const body = JSON.stringify({ action: 'opened' });
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, 'wrong-secret'),
        'x-github-event': 'pull_request',
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('body parsing & event handling — edge cases', () => {
    it('returns 400 on malformed JSON body when event is pull_request', async () => {
      const body = 'not-valid-json';
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
        'x-github-event': 'pull_request',
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(await res.text()).toBe('Invalid JSON');
    });

    it('returns 400 when JSON is well-formed but missing required fields', async () => {
      const body = JSON.stringify({ action: 'opened' }); // no repository or pull_request
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
        'x-github-event': 'pull_request',
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(await res.text()).toBe('Malformed payload');
    });

    it('skips events where x-github-event header is missing', async () => {
      const body = '{}';
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
      });
      const res = await POST(req);
      const data = await res.json();
      expect(data).toEqual({ ok: true, skipped: true });
    });

    it('treats unknown PR actions as no-op (linked: 0 even when task found)', async () => {
      mockTask.findUnique.mockResolvedValue({
        id: 'task-1',
        identifier: 'HM-7',
        status: 'TODO',
        createdById: 'user-1',
      });

      const payload = {
        action: 'labeled', // not in opened/reopened/edited/closed
        pull_request: {
          id: 300,
          number: 3,
          title: 'HM-7 something',
          body: '',
          html_url: 'https://github.com/test/repo/pull/3',
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
      expect(mockGitHubPR.upsert).not.toHaveBeenCalled();
      expect(mockGitHubPR.updateMany).not.toHaveBeenCalled();
    });

    it('handles "reopened" action like opened', async () => {
      mockTask.findUnique.mockResolvedValue({
        id: 'task-1',
        identifier: 'HM-7',
        status: 'IN_PROGRESS',
        createdById: 'user-1',
      });
      mockGitHubPR.upsert.mockResolvedValue({});

      const payload = {
        action: 'reopened',
        pull_request: {
          id: 301,
          number: 4,
          title: 'HM-7 reopened',
          body: '',
          html_url: 'https://github.com/test/repo/pull/4',
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
      expect(mockGitHubPR.upsert).toHaveBeenCalled();
      expect(mockTask.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'IN_REVIEW' },
      });
    });

    it('handles "edited" action like opened', async () => {
      mockTask.findUnique.mockResolvedValue({
        id: 'task-1',
        identifier: 'HM-8',
        status: 'DONE',
        createdById: 'user-1',
      });
      mockGitHubPR.upsert.mockResolvedValue({});

      const payload = {
        action: 'edited',
        pull_request: {
          id: 302,
          number: 5,
          title: 'HM-8 edited',
          body: '',
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
      // status DONE — no transition
      expect(mockTask.update).not.toHaveBeenCalled();
    });
  });

  describe('identifier extraction', () => {
    function buildOpenedReq(title: string, prBody: string = '') {
      const payload = {
        action: 'opened',
        pull_request: {
          id: Math.floor(Math.random() * 100000),
          number: 1,
          title,
          body: prBody,
          html_url: 'https://github.com/test/repo/pull/1',
          user: { login: 'dev', avatar_url: 'https://example.com/avatar' },
        },
        repository: { full_name: 'test/repo' },
      };
      const body = JSON.stringify(payload);
      return createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
        'x-github-event': 'pull_request',
      });
    }

    it('extracts identifier from PR title only', async () => {
      mockTask.findUnique.mockResolvedValue(null);
      await POST(buildOpenedReq('HM-1 title only', ''));
      expect(mockTask.findUnique).toHaveBeenCalledTimes(1);
      expect(mockTask.findUnique).toHaveBeenCalledWith({ where: { identifier: 'HM-1' } });
    });

    it('extracts identifier from PR body only', async () => {
      mockTask.findUnique.mockResolvedValue(null);
      await POST(buildOpenedReq('No ref in title', 'fixes HM-42'));
      expect(mockTask.findUnique).toHaveBeenCalledTimes(1);
      expect(mockTask.findUnique).toHaveBeenCalledWith({ where: { identifier: 'HM-42' } });
    });

    it('extracts identifier from PR body when body is null', async () => {
      mockTask.findUnique.mockResolvedValue(null);
      const payload = {
        action: 'opened',
        pull_request: {
          id: 1,
          number: 1,
          title: 'HM-9 fix',
          body: null,
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
      expect(res.status).toBe(200);
      expect(mockTask.findUnique).toHaveBeenCalledWith({ where: { identifier: 'HM-9' } });
    });

    it('matches lowercase hm- (case-insensitive regex) and normalises to HM-', async () => {
      mockTask.findUnique.mockResolvedValue(null);
      await POST(buildOpenedReq('fixes hm-7'));
      expect(mockTask.findUnique).toHaveBeenCalledTimes(1);
      // The regex uses /i so 'hm-7' matches; identifier built as `HM-${m[1]}` so always uppercase
      expect(mockTask.findUnique).toHaveBeenCalledWith({ where: { identifier: 'HM-7' } });
    });

    it('handles large identifier numbers (HM-12345)', async () => {
      mockTask.findUnique.mockResolvedValue(null);
      await POST(buildOpenedReq('HM-12345 big number'));
      expect(mockTask.findUnique).toHaveBeenCalledWith({ where: { identifier: 'HM-12345' } });
    });

    it('does NOT match identifier embedded mid-word (e.g. "fooHM-1bar")', async () => {
      mockTask.findUnique.mockResolvedValue(null);
      await POST(buildOpenedReq('fooHM-1bar nothing'));
      // \b word boundaries — no match expected
      expect(mockTask.findUnique).not.toHaveBeenCalled();
    });

    it('matches identifier followed by punctuation', async () => {
      mockTask.findUnique.mockResolvedValue(null);
      await POST(buildOpenedReq('Closes HM-5, refs HM-6.'));
      expect(mockTask.findUnique).toHaveBeenCalledTimes(2);
    });

    it('processes ALL unique identifiers (not just the first)', async () => {
      // Pretend HM-1 and HM-3 exist; HM-2 does not.
      mockTask.findUnique.mockImplementation(async ({ where }: { where: { identifier: string } }) => {
        if (where.identifier === 'HM-1' || where.identifier === 'HM-3') {
          return { id: `task-${where.identifier}`, identifier: where.identifier, status: 'DONE', createdById: 'u' };
        }
        return null;
      });
      mockGitHubPR.upsert.mockResolvedValue({});

      const res = await POST(buildOpenedReq('HM-1 HM-2', 'HM-3'));
      const data = await res.json();
      expect(mockTask.findUnique).toHaveBeenCalledTimes(3);
      // Two tasks existed and were linked
      expect(data.linked).toBe(2);
    });
  });

  describe('repository allowlist', () => {
    afterEach(() => {
      delete process.env.GITHUB_ALLOWED_REPOS;
    });

    it('skips events from non-allowlisted repos when allowlist is set', async () => {
      process.env.GITHUB_ALLOWED_REPOS = 'safe/repo,other/repo';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const payload = {
        action: 'opened',
        pull_request: {
          id: 1,
          number: 1,
          title: 'HM-1 test',
          body: '',
          html_url: 'https://github.com/evil/repo/pull/1',
          user: { login: 'attacker', avatar_url: '' },
        },
        repository: { full_name: 'evil/repo' },
      };
      const body = JSON.stringify(payload);
      const req = createRequest(body, {
        'x-hub-signature-256': sign(body, secret),
        'x-github-event': 'pull_request',
      });

      const res = await POST(req);
      const data = await res.json();
      expect(data).toEqual({ ok: true, skipped: true });
      expect(mockTask.findUnique).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('accepts events from allowlisted repos', async () => {
      process.env.GITHUB_ALLOWED_REPOS = 'safe/repo,test/repo';
      mockTask.findUnique.mockResolvedValue(null);

      const payload = {
        action: 'opened',
        pull_request: {
          id: 1,
          number: 1,
          title: 'HM-1 test',
          body: '',
          html_url: 'https://github.com/test/repo/pull/1',
          user: { login: 'dev', avatar_url: '' },
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
      expect(mockTask.findUnique).toHaveBeenCalled();
    });

    it('treats empty GITHUB_ALLOWED_REPOS as no allowlist (accepts all)', async () => {
      process.env.GITHUB_ALLOWED_REPOS = '';
      mockTask.findUnique.mockResolvedValue(null);

      const payload = {
        action: 'opened',
        pull_request: {
          id: 1,
          number: 1,
          title: 'HM-1 test',
          body: '',
          html_url: 'https://github.com/anyone/repo/pull/1',
          user: { login: 'dev', avatar_url: '' },
        },
        repository: { full_name: 'anyone/repo' },
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
  });

  describe('task not found', () => {
    it('continues processing other identifiers when one task is missing', async () => {
      // HM-1 missing, HM-2 exists
      mockTask.findUnique.mockImplementation(async ({ where }: { where: { identifier: string } }) => {
        if (where.identifier === 'HM-2') {
          return { id: 'task-2', identifier: 'HM-2', status: 'DONE', createdById: 'u' };
        }
        return null;
      });
      mockGitHubPR.upsert.mockResolvedValue({});

      const payload = {
        action: 'opened',
        pull_request: {
          id: 999,
          number: 9,
          title: 'HM-1 missing, HM-2 exists',
          body: '',
          html_url: 'https://github.com/test/repo/pull/9',
          user: { login: 'dev', avatar_url: '' },
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
      expect(data.linked).toBe(1);
      expect(mockGitHubPR.upsert).toHaveBeenCalledTimes(1);
    });
  });
});
