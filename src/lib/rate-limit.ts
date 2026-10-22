/**
 * Sliding-window rate limit per key (e.g. client IP), kept in memory.
 * On Vercel this lives per function instance: it stops bursts from one sender, not a distributed
 * attack (that would need shared storage). The clock is injected for tests.
 */
export interface RateLimiter {
  /** Records a hit and returns whether it is allowed. */
  hit(key: string): boolean;
}

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      // Keep memory bounded: drop keys whose hits have all expired.
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.every((at) => t - at >= windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}
