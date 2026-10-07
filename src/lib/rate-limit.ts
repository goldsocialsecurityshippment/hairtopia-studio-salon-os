/**
 * A deliberately simple in-memory rate limiter.
 *
 * HONEST LIMITATION: this state lives in the Node process's memory. On a
 * single small server (this app's documented deployment target), that's a
 * real, effective limiter. If this app is ever deployed across multiple
 * serverless instances or horizontally-scaled containers, each instance
 * has its OWN counters — a determined attacker could get roughly
 * (limit × instance count) requests through rather than just `limit`. That
 * is a real gap for that deployment shape, not something this code hides:
 * if you scale horizontally, replace this with a shared store (Redis,
 * Upstash, etc.) using the same `checkRateLimit` call signature so nothing
 * else in the app needs to change.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Periodic cleanup so this Map doesn't grow unboundedly over a long-running
// process — cheap, and only matters for very long uptimes.
setInterval(() => {
  const now = Date.now();
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt < now) buckets.delete(key);
  });
}, 5 * 60 * 1000).unref?.();

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count++;
  return { allowed: true, retryAfterMs: 0 };
}

/** Best-effort client identifier from a request — IP when available (via
 * the standard proxy header most hosts set), falling back to a constant so
 * at least a global cap still applies rather than throwing. */
export function clientKeyFromHeaders(headers: Headers, prefix: string): string {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  return `${prefix}:${ip}`;
}
