// In-memory sliding window rate limiter.
// Suitable for single-instance deployments. For multi-instance, replace the Map
// with a shared store (e.g. Upstash Redis) using the same interface.
const windows = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  windows.set(key, recent);
  return true;
}
