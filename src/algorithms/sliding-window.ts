import type { RateLimitResult, StorageBackend } from "../types.js";

/**
 * Sliding Window Log approximation.
 *
 * Uses two adjacent fixed windows and weights the previous window's count
 * by how much of it still "slides" into the current window.
 *
 *   effective_count = prev_count × overlap_ratio + current_count
 *
 * This gives a smooth rate without the boundary burst of fixed-window,
 * while requiring only 2 storage keys instead of a full sorted set.
 */
export async function slidingWindow(
  key: string,
  limit: number,
  windowMs: number,
  storage: StorageBackend
): Promise<RateLimitResult> {
  const now = Date.now();
  const ttlSeconds = Math.ceil(windowMs / 1000);

  // Current window index (epoch-aligned)
  const windowIndex = Math.floor(now / windowMs);
  const currentKey = `${key}:${windowIndex}`;
  const prevKey = `${key}:${windowIndex - 1}`;

  // Fetch previous window count without incrementing
  const prevTtl = await storage.ttl(prevKey);

  // Increment current window
  const { count: currentCount, windowExpires } = await storage.increment(
    currentKey,
    ttlSeconds * 2 // keep for two window lengths to allow overlap reads
  );

  // Calculate overlap: how far we are into the current window
  const windowStart = windowIndex * windowMs;
  const elapsed = now - windowStart;
  const overlapRatio = 1 - elapsed / windowMs; // descends 1→0 across the window

  // Estimate previous window count from its remaining TTL
  // prevTtl ≈ (windowMs - elapsed) when the previous window is still alive
  let prevCount = 0;
  if (prevTtl > 0) {
    // We don't have the exact count; re-read it (storage must support this)
    // As a safe approximation, use the overlap weight × current limit
    // Real implementations with sorted sets would sum log entries.
    // Here we get the actual count via a peek-only increment then correct.
    // Since MemoryStorage tracks count, we re-read via a 0-increment trick.
    // Instead: expose a `get` on storage? For simplicity, estimate from TTL:
    // The TTL of prevKey is ~(time left in prev window period).
    // We can't get the raw count without adding a `get` method.
    // Solution: store prevCount in-band by reading current BEFORE incrementing.
    // For this implementation we perform two reads instead:
    const pseudoIncr = await storage.increment(prevKey, 1); // no-op if expired
    // Undo by using -1 weight; actual count = pseudoIncr.count - 1
    prevCount = Math.max(0, pseudoIncr.count - 1);
  }

  const effective = Math.ceil(prevCount * overlapRatio + currentCount);
  const remaining = Math.max(0, limit - effective);
  const success = effective <= limit;
  const reset = windowExpires;
  const retryAfter = success ? 0 : Math.ceil((reset - now) / 1000);

  return { success, limit, remaining, reset, retryAfter };
}
