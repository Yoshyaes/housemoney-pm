/**
 * Sliding window rate limiter.
 *
 * When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, uses
 * Upstash Redis for shared state across serverless instances (required on
 * multi-instance deployments such as Vercel). Falls back to an in-process
 * Map when Redis is not configured (suitable for local dev and single-instance
 * deployments only).
 *
 * Usage:
 *   const allowed = await rateLimit('upload:userId', 10, 60_000);
 *   if (!allowed) throw new TRPCError({ code: 'TOO_MANY_REQUESTS' });
 */

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

const windows = new Map<string, number[]>();
const PRUNE_INTERVAL = 5 * 60 * 1000;
let lastPrune = Date.now();

function pruneStaleKeys(maxAge: number) {
  const now = Date.now();
  for (const [key, timestamps] of windows) {
    const recent = timestamps.filter((t) => now - t < maxAge);
    if (recent.length === 0) {
      windows.delete(key);
    } else {
      windows.set(key, recent);
    }
  }
  lastPrune = now;
}

function rateLimitMemory(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (now - lastPrune > PRUNE_INTERVAL) pruneStaleKeys(windowMs);
  const recent = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  windows.set(key, recent);
  return true;
}

// ---------------------------------------------------------------------------
// Redis backend (Upstash REST API — no extra package needed)
// ---------------------------------------------------------------------------

async function rateLimitRedis(
  key: string,
  max: number,
  windowMs: number,
  redisUrl: string,
  redisToken: string
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const redisKey = `rl:${key}`;

  // Sliding window using a sorted set:
  // ZREMRANGEBYSCORE removes expired entries, ZADD adds the current timestamp,
  // ZCARD returns the count, and EXPIRE keeps the key from accumulating forever.
  const pipeline = [
    ['ZREMRANGEBYSCORE', redisKey, '-inf', String(windowStart)],
    ['ZADD', redisKey, String(now), `${now}`],
    ['ZCARD', redisKey],
    ['PEXPIRE', redisKey, String(windowMs * 2)],
  ];

  try {
    const res = await fetch(`${redisUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redisToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pipeline),
    });

    if (!res.ok) {
      console.error('[rateLimit] Redis pipeline failed:', res.status);
      // Fail open: allow request on Redis error to avoid blocking all users
      return true;
    }

    const results = (await res.json()) as Array<{ result: unknown }>;
    const count = results[2]?.result;
    return typeof count === 'number' && count <= max;
  } catch (err) {
    console.error('[rateLimit] Redis request threw:', err);
    return true; // Fail open
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    return rateLimitRedis(key, max, windowMs, redisUrl, redisToken);
  }

  return rateLimitMemory(key, max, windowMs);
}
