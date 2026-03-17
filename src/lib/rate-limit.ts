// In-memory sliding window rate limiter.
// Suitable for single-instance deployments. For multi-instance, replace the Map
// with a shared store (e.g. Upstash Redis) using the same interface.
const windows = new Map<string, number[]>();

// Periodic cleanup: prune stale keys every 5 minutes
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

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();

  // Prune stale entries periodically
  if (now - lastPrune > PRUNE_INTERVAL) {
    pruneStaleKeys(windowMs);
  }

  const recent = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  windows.set(key, recent);
  return true;
}
