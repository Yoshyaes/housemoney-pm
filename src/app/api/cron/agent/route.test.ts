import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  workspace: { findMany: vi.fn() },
  runPeriodicAnalysis: vi.fn(),
}));

vi.mock('@/server/db', () => ({
  db: { workspace: mocks.workspace },
}));

vi.mock('@/server/ai/agent-engine', () => ({
  runPeriodicAnalysis: mocks.runPeriodicAnalysis,
}));

import { GET, POST } from './route';

function createRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {}
): NextRequest {
  return new NextRequest(new URL(url), {
    method: init.method || 'GET',
    headers: init.headers,
    body: init.body,
  });
}

describe('cron/agent route', () => {
  const CRON_SECRET = 'super-secret-cron-key';
  let originalSecret: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = CRON_SECRET;
    mocks.workspace.findMany.mockResolvedValue([]);
    mocks.runPeriodicAnalysis.mockResolvedValue(0);
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  describe('authentication', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const req = createRequest('http://localhost/api/cron/agent');
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: 'Unauthorized' });
      expect(mocks.workspace.findMany).not.toHaveBeenCalled();
    });

    it('returns 401 when CRON_SECRET env var is not configured', async () => {
      delete process.env.CRON_SECRET;
      const req = createRequest('http://localhost/api/cron/agent', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
      expect(mocks.workspace.findMany).not.toHaveBeenCalled();
    });

    it('returns 401 when CRON_SECRET env var is empty string', async () => {
      process.env.CRON_SECRET = '';
      const req = createRequest('http://localhost/api/cron/agent', {
        headers: { authorization: 'Bearer ' },
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
      expect(mocks.workspace.findMany).not.toHaveBeenCalled();
    });

    it('returns 401 when bearer token does not match secret', async () => {
      const req = createRequest('http://localhost/api/cron/agent', {
        headers: { authorization: 'Bearer wrong-secret' },
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
      expect(mocks.workspace.findMany).not.toHaveBeenCalled();
    });

    it('returns 401 when x-cron-secret header is wrong', async () => {
      const req = createRequest('http://localhost/api/cron/agent', {
        headers: { 'x-cron-secret': 'nope' },
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('accepts valid Authorization: Bearer header', async () => {
      const req = createRequest('http://localhost/api/cron/agent', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('accepts valid x-cron-secret header', async () => {
      const req = createRequest('http://localhost/api/cron/agent', {
        headers: { 'x-cron-secret': CRON_SECRET },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('accepts lowercase "bearer" prefix (RFC 7235 — scheme is case-insensitive)', async () => {
      const req = createRequest('http://localhost/api/cron/agent', {
        headers: { authorization: `bearer ${CRON_SECRET}` },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('rejects an Authorization header that does not begin with the Bearer scheme', async () => {
      const req = createRequest('http://localhost/api/cron/agent', {
        // No "Bearer" prefix — must NOT silently fall back to using the
        // whole header value as the secret.
        headers: { authorization: CRON_SECRET },
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe('schedule handling', () => {
    beforeEach(() => {
      mocks.workspace.findMany.mockResolvedValue([
        { id: 'ws-1', name: 'Workspace 1' },
      ]);
      mocks.runPeriodicAnalysis.mockResolvedValue(3);
    });

    it('defaults to 15min schedule when no query param or body provided', async () => {
      const req = createRequest('http://localhost/api/cron/agent', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      const res = await GET(req);
      const data = await res.json();
      expect(data.schedule).toBe('15min');
      expect(mocks.runPeriodicAnalysis).toHaveBeenCalledWith('ws-1', '15min');
    });

    it('accepts schedule=daily query param', async () => {
      const req = createRequest('http://localhost/api/cron/agent?schedule=daily', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      const res = await GET(req);
      const data = await res.json();
      expect(data.schedule).toBe('daily');
      expect(mocks.runPeriodicAnalysis).toHaveBeenCalledWith('ws-1', 'daily');
    });

    it('accepts schedule=weekly query param', async () => {
      const req = createRequest('http://localhost/api/cron/agent?schedule=weekly', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      const res = await GET(req);
      const data = await res.json();
      expect(data.schedule).toBe('weekly');
    });

    it('ignores invalid schedule query param and falls back to 15min', async () => {
      const req = createRequest('http://localhost/api/cron/agent?schedule=invalid', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      const res = await GET(req);
      const data = await res.json();
      expect(data.schedule).toBe('15min');
    });

    it('reads schedule from POST body when no query param', async () => {
      const req = createRequest('http://localhost/api/cron/agent', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${CRON_SECRET}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ schedule: 'daily' }),
      });
      const res = await POST(req);
      const data = await res.json();
      expect(data.schedule).toBe('daily');
    });

    it('ignores invalid schedule in POST body', async () => {
      const req = createRequest('http://localhost/api/cron/agent', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${CRON_SECRET}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ schedule: 'hourly' }),
      });
      const res = await POST(req);
      const data = await res.json();
      expect(data.schedule).toBe('15min');
    });

    it('gracefully handles malformed POST body', async () => {
      const req = createRequest('http://localhost/api/cron/agent', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${CRON_SECRET}`,
          'content-type': 'application/json',
        },
        body: 'not json{{{',
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.schedule).toBe('15min');
    });

    it('query param takes precedence over POST body', async () => {
      const req = createRequest('http://localhost/api/cron/agent?schedule=weekly', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${CRON_SECRET}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ schedule: 'daily' }),
      });
      const res = await POST(req);
      const data = await res.json();
      expect(data.schedule).toBe('weekly');
    });
  });

  describe('agent execution', () => {
    it('runs analysis for every workspace returned', async () => {
      mocks.workspace.findMany.mockResolvedValue([
        { id: 'ws-1', name: 'Workspace 1' },
        { id: 'ws-2', name: 'Workspace 2' },
        { id: 'ws-3', name: 'Workspace 3' },
      ]);
      mocks.runPeriodicAnalysis.mockResolvedValueOnce(1);
      mocks.runPeriodicAnalysis.mockResolvedValueOnce(5);
      mocks.runPeriodicAnalysis.mockResolvedValueOnce(2);

      const req = createRequest('http://localhost/api/cron/agent', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      const res = await GET(req);
      const data = await res.json();

      expect(mocks.runPeriodicAnalysis).toHaveBeenCalledTimes(3);
      expect(data.workspacesProcessed).toBe(3);
      expect(data.totalInsightsCreated).toBe(8);
      expect(data.results).toHaveLength(3);
    });

    it('returns 200 with results when there are no workspaces', async () => {
      mocks.workspace.findMany.mockResolvedValue([]);
      const req = createRequest('http://localhost/api/cron/agent', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.workspacesProcessed).toBe(0);
      expect(data.totalInsightsCreated).toBe(0);
      expect(data.results).toEqual([]);
    });

    it('does not crash when one workspace analysis throws — marks it -1 and continues', async () => {
      mocks.workspace.findMany.mockResolvedValue([
        { id: 'ws-1', name: 'Workspace 1' },
        { id: 'ws-2', name: 'Workspace 2' },
        { id: 'ws-3', name: 'Workspace 3' },
      ]);
      mocks.runPeriodicAnalysis.mockResolvedValueOnce(2);
      mocks.runPeriodicAnalysis.mockRejectedValueOnce(new Error('boom'));
      mocks.runPeriodicAnalysis.mockResolvedValueOnce(4);

      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const req = createRequest('http://localhost/api/cron/agent', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.workspacesProcessed).toBe(3);
      // Sum is 2 + 0 (failure clamped to 0) + 4 = 6
      expect(data.totalInsightsCreated).toBe(6);
      expect(data.results).toEqual([
        { workspaceId: 'ws-1', name: 'Workspace 1', insights: 2 },
        { workspaceId: 'ws-2', name: 'Workspace 2', insights: -1 },
        { workspaceId: 'ws-3', name: 'Workspace 3', insights: 4 },
      ]);
      expect(errSpy).toHaveBeenCalled();

      errSpy.mockRestore();
    });
  });

  describe('HTTP method routing', () => {
    it('GET and POST both route to the same handler', async () => {
      mocks.workspace.findMany.mockResolvedValue([]);

      const getReq = createRequest('http://localhost/api/cron/agent', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      const postReq = createRequest('http://localhost/api/cron/agent', {
        method: 'POST',
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });

      const [getRes, postRes] = await Promise.all([GET(getReq), POST(postReq)]);
      expect(getRes.status).toBe(200);
      expect(postRes.status).toBe(200);
    });
  });
});
