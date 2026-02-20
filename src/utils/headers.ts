import type { RateLimitHeaders, RateLimitResult } from "../types.js";

export function buildHeaders(result: RateLimitResult): RateLimitHeaders {
  const headers: RateLimitHeaders = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
  };

  if (!result.success) {
    headers["Retry-After"] = String(result.retryAfter);
  }

  return headers;
}

/**
 * Apply rate limit headers to a Headers instance (Web API / Next.js).
 */
export function applyHeaders(
  headers: Headers,
  rlHeaders: RateLimitHeaders
): void {
  for (const [key, value] of Object.entries(rlHeaders)) {
    if (value !== undefined) headers.set(key, value);
  }
}
