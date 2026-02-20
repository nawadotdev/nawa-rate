/**
 * nawa-rate — Framework-agnostic rate limiting
 *
 * Core exports (framework-agnostic):
 *   import { createRateLimiter, RateLimiter, MemoryStorage, RedisStorage } from 'nawa-rate'
 *
 * Express:
 *   import { expressRateLimit } from 'nawa-rate/express'
 *
 * Next.js:
 *   import { nextRateLimit, withRateLimit } from 'nawa-rate/next'
 */

// Core
export { RateLimiter, createRateLimiter } from "./rate-limiter.js";

// Storage
export { MemoryStorage } from "./storage/memory.js";
export { RedisStorage } from "./storage/redis.js";
export type { RedisLike } from "./storage/redis.js";

// Types
export type {
  Algorithm,
  DurationMs,
  DurationString,
  HeadersLike,
  IncrementResult,
  RateLimitHeaders,
  RateLimitResult,
  RateLimiterConfig,
  RequestLike,
  StorageBackend,
} from "./types.js";

// Utils (useful for custom integrations)
export { parseDuration } from "./utils/duration.js";
export { extractIp } from "./utils/ip.js";
export { buildHeaders, applyHeaders } from "./utils/headers.js";
