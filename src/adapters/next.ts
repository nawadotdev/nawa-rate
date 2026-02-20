/**
 * Next.js adapter — works with both App Router and Pages Router.
 *
 * App Router (middleware.ts / route handlers):
 *   import { nextRateLimit } from 'nawa-rate/next'
 *
 *   const limiter = nextRateLimit({ limit: 60, window: '1m' })
 *
 *   export async function middleware(req: NextRequest) {
 *     return limiter(req)
 *   }
 *
 *   // Or in a Route Handler:
 *   export async function GET(req: NextRequest) {
 *     const res = await limiter(req)
 *     if (res) return res          // 429 response
 *     return NextResponse.json({ ok: true })
 *   }
 *
 * Pages Router (API routes):
 *   import { withRateLimit } from 'nawa-rate/next'
 *
 *   export default withRateLimit(handler, { limit: 20, window: '1m' })
 */
import { RateLimiter } from "../rate-limiter.js";
import type { RateLimiterConfig, RequestLike } from "../types.js";

export type { RateLimiterConfig } from "../types.js";

// ---------------------------------------------------------------------------
// App Router helpers (Web Request / NextRequest)
// ---------------------------------------------------------------------------

/**
 * Returns null when the request is allowed (attach headers manually if needed),
 * or a ready Response with status 429 when blocked.
 *
 * Designed for use in next/server Middleware or Route Handlers.
 */
export function nextRateLimit(
  config?: RateLimiterConfig
): (req: Request) => Promise<Response | null> {
  const limiter = new RateLimiter(config);

  return async function rateLimitHandler(
    req: Request
  ): Promise<Response | null> {
    const ip =
      // Vercel / Cloudflare proxy headers
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    const reqLike: RequestLike = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      ip,
    };

    const { result, blockedResponse, applyHeaders } =
      await limiter.limit_(reqLike);

    if (blockedResponse) {
      return blockedResponse;
    }

    // Allowed — caller can use applyHeaders(response) to stamp RL headers
    void result;
    void applyHeaders;
    return null;
  };
}

/**
 * Wrap a Next.js route handler with rate limiting.
 * Returns 429 before calling the handler when the limit is exceeded.
 */
export function withNextRateLimit<T extends Request = Request>(
  handler: (req: T, ...args: unknown[]) => Promise<Response>,
  config?: RateLimiterConfig
): (req: T, ...args: unknown[]) => Promise<Response> {
  const check = nextRateLimit(config);

  return async function wrappedHandler(
    req: T,
    ...args: unknown[]
  ): Promise<Response> {
    const blocked = await check(req);
    if (blocked) return blocked;
    return handler(req, ...args);
  };
}

// ---------------------------------------------------------------------------
// Pages Router helpers (Node IncomingMessage / NextApiRequest)
// ---------------------------------------------------------------------------

interface PagesReq {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

interface PagesRes {
  statusCode: number;
  setHeader(name: string, value: string | number): void;
  json(body: unknown): void;
  end(): void;
}

type PagesHandler = (req: PagesReq, res: PagesRes) => void | Promise<void>;

/**
 * Higher-order function for Pages Router API handlers.
 *
 * export default withRateLimit(handler, { limit: 10, window: '1m' })
 */
export function withRateLimit(
  handler: PagesHandler,
  config?: RateLimiterConfig
): PagesHandler {
  const limiter = new RateLimiter(config);

  return async function rateLimitedHandler(
    req: PagesReq,
    res: PagesRes
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
      ip: req.socket?.remoteAddress,
    };

    const { result, blockedResponse } = await limiter.limit_(reqLike);

    if (!(config?.skipHeaders)) {
      res.setHeader("X-RateLimit-Limit", result.limit);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(result.reset / 1000));
      if (!result.success) {
        res.setHeader("Retry-After", result.retryAfter);
      }
    }

    if (blockedResponse) {
      res.statusCode = 429;
      const body = await blockedResponse.json();
      res.json(body);
      return;
    }

    return handler(req, res);
  };
}

export { RateLimiter, createRateLimiter } from "../rate-limiter.js";
export { MemoryStorage } from "../storage/memory.js";
export { RedisStorage } from "../storage/redis.js";
export type { RedisLike } from "../storage/redis.js";
