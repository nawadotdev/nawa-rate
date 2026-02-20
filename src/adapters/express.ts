/**
 * Express / Connect middleware adapter.
 *
 * Usage:
 *   import { expressRateLimit } from 'nawa-rate/express'
 *
 *   app.use(expressRateLimit({ limit: 100, window: '15m' }))
 */
import { RateLimiter } from "../rate-limiter.js";
import type { RateLimiterConfig, RequestLike } from "../types.js";

export type { RateLimiterConfig } from "../types.js";

// Minimal typings — avoids requiring @types/express as a dependency
interface NodeRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

interface NodeResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
  headersSent: boolean;
}

type NextFunction = (err?: unknown) => void;

export type ExpressMiddleware = (
  req: NodeRequest,
  res: NodeResponse,
  next: NextFunction
) => Promise<void>;

/**
 * Create an Express-compatible rate limiting middleware.
 */
export function expressRateLimit(config?: RateLimiterConfig): ExpressMiddleware {
  const limiter = new RateLimiter(config);

  return async function rateLimitMiddleware(
    req: NodeRequest,
    res: NodeResponse,
    next: NextFunction
  ): Promise<void> {
    const reqLike: RequestLike = {
      method: req.method,
      url: req.url,
      headers: {
        get(name: string): string | null {
          const val = req.headers[name.toLowerCase()];
          if (typeof val === "string") return val;
          if (Array.isArray(val)) return val[0] ?? null;
          return null;
        },
        ...req.headers,
      },
      ip: req.ip ?? req.socket?.remoteAddress,
    };

    try {
      const { result, blockedResponse } = await limiter.limit_(reqLike);

      // Always set headers
      if (!(config?.skipHeaders)) {
        res.setHeader("X-RateLimit-Limit", String(result.limit));
        res.setHeader("X-RateLimit-Remaining", String(result.remaining));
        res.setHeader(
          "X-RateLimit-Reset",
          String(Math.ceil(result.reset / 1000))
        );
        if (!result.success) {
          res.setHeader("Retry-After", String(result.retryAfter));
        }
      }

      if (blockedResponse) {
        res.statusCode = 429;
        if (!res.headersSent) {
          res.setHeader("Content-Type", "application/json");
        }
        const body = await blockedResponse.text();
        res.end(body);
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export { RateLimiter, createRateLimiter } from "../rate-limiter.js";
export { MemoryStorage } from "../storage/memory.js";
export { RedisStorage } from "../storage/redis.js";
export type { RedisLike } from "../storage/redis.js";
