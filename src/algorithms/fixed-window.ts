import type { RateLimitResult, StorageBackend } from "../types.js";

/**
 * Fixed Window algorithm.
 *
 * Divides time into equal-sized windows. Counts requests in the current
 * window. Simple and efficient, but susceptible to burst at window boundaries.
 */
export async function fixedWindow(
  key: string,
  limit: number,
  windowMs: number,
  storage: StorageBackend
): Promise<RateLimitResult> {
  const ttlSeconds = Math.ceil(windowMs / 1000);
  const { count, windowExpires } = await storage.increment(key, ttlSeconds);

  const remaining = Math.max(0, limit - count);
  const success = count <= limit;
  const reset = windowExpires;
  const retryAfter = success ? 0 : Math.ceil((reset - Date.now()) / 1000);

  return { success, limit, remaining, reset, retryAfter };
}
