import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('rateLimit', () => {
  beforeEach(() => {
    // Ensure no Redis env vars so the in-memory backend is used by default
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('in-memory backend', () => {
    it('allows requests below the limit', async () => {
      const { rateLimit } = await import('./rate-limit');
      const key = `test:allow:${Math.random()}`;
      expect(await rateLimit(key, 3, 60_000)).toBe(true);
      expect(await rateLimit(key, 3, 60_000)).toBe(true);
      expect(await rateLimit(key, 3, 60_000)).toBe(true);
    });

    it('blocks the request that exceeds the limit', async () => {
      const { rateLimit } = await import('./rate-limit');
      const key = `test:block:${Math.random()}`;
      expect(await rateLimit(key, 2, 60_000)).toBe(true);
      expect(await rateLimit(key, 2, 60_000)).toBe(true);
      expect(await rateLimit(key, 2, 60_000)).toBe(false);
    });

    it('counts requests independently per key', async () => {
      const { rateLimit } = await import('./rate-limit');
      const k1 = `test:k1:${Math.random()}`;
      const k2 = `test:k2:${Math.random()}`;
      expect(await rateLimit(k1, 1, 60_000)).toBe(true);
      expect(await rateLimit(k1, 1, 60_000)).toBe(false);
      // k2 has its own bucket
      expect(await rateLimit(k2, 1, 60_000)).toBe(true);
    });

    it('expires entries after the sliding window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const { rateLimit } = await import('./rate-limit');
      const key = `test:expire:${Math.random()}`;

      expect(await rateLimit(key, 1, 1000)).toBe(true);
      expect(await rateLimit(key, 1, 1000)).toBe(false);

      // advance past the window
      vi.setSystemTime(new Date('2026-01-01T00:00:02Z'));
      expect(await rateLimit(key, 1, 1000)).toBe(true);
    });

    it('treats max=0 as immediately blocking', async () => {
      const { rateLimit } = await import('./rate-limit');
      const key = `test:zero:${Math.random()}`;
      expect(await rateLimit(key, 0, 60_000)).toBe(false);
    });
  });

  describe('Redis backend', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
      vi.resetModules();
    });

    it('uses the Redis pipeline when env vars are set', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { result: 0 },
          { result: 1 },
          { result: 1 },
          { result: 1 },
        ],
      });
      vi.stubGlobal('fetch', fetchMock);

      const { rateLimit } = await import('./rate-limit');
      const allowed = await rateLimit('test:redis', 5, 60_000);

      expect(allowed).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0];
      expect(call[0]).toBe('https://example.upstash.io/pipeline');
      expect(call[1].method).toBe('POST');
      expect(call[1].headers.Authorization).toBe('Bearer test-token');

      const body = JSON.parse(call[1].body);
      // pipeline contains 4 commands: ZREMRANGEBYSCORE, ZADD, ZCARD, PEXPIRE
      expect(body).toHaveLength(4);
      expect(body[0][0]).toBe('ZREMRANGEBYSCORE');
      expect(body[1][0]).toBe('ZADD');
      expect(body[2][0]).toBe('ZCARD');
      expect(body[3][0]).toBe('PEXPIRE');
      // key is prefixed with rl:
      expect(body[1][1]).toBe('rl:test:redis');
    });

    it('returns false when ZCARD count exceeds max', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { result: 0 },
          { result: 1 },
          { result: 6 },
          { result: 1 },
        ],
      });
      vi.stubGlobal('fetch', fetchMock);

      const { rateLimit } = await import('./rate-limit');
      expect(await rateLimit('test:over', 5, 60_000)).toBe(false);
    });

    it('returns true (fail open) when Redis returns non-OK', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });
      vi.stubGlobal('fetch', fetchMock);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { rateLimit } = await import('./rate-limit');
      expect(await rateLimit('test:fail', 5, 60_000)).toBe(true);
      errSpy.mockRestore();
    });

    it('returns true (fail open) when fetch throws', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
      vi.stubGlobal('fetch', fetchMock);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { rateLimit } = await import('./rate-limit');
      expect(await rateLimit('test:throw', 5, 60_000)).toBe(true);
      errSpy.mockRestore();
    });

    it('returns false when ZCARD result is not a number', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { result: 0 },
          { result: 1 },
          { result: 'not-a-number' },
          { result: 1 },
        ],
      });
      vi.stubGlobal('fetch', fetchMock);

      const { rateLimit } = await import('./rate-limit');
      expect(await rateLimit('test:bad', 5, 60_000)).toBe(false);
    });

    it('falls back to memory when only one Redis env var is set', async () => {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { rateLimit } = await import('./rate-limit');
      const key = `test:partial:${Math.random()}`;
      expect(await rateLimit(key, 1, 60_000)).toBe(true);
      expect(await rateLimit(key, 1, 60_000)).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
