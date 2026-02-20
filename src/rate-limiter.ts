import { fixedWindow } from "./algorithms/fixed-window.js";
import { slidingWindow } from "./algorithms/sliding-window.js";
import { MemoryStorage } from "./storage/memory.js";
import type {
  RateLimitResult,
  RateLimiterConfig,
  RequestLike,
  StorageBackend,
} from "./types.js";
import { parseDuration } from "./utils/duration.js";
import { extractIp } from "./utils/ip.js";

export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly storage: StorageBackend;
  private readonly algorithm: NonNullable<RateLimiterConfig["algorithm"]>;
  private readonly keyGenerator: (req: RequestLike) => string | Promise<string>;
  private readonly onLimitReached: RateLimiterConfig["onLimitReached"];
  private readonly skipHeaders: boolean;
  private readonly prefix: string;

  constructor(config: RateLimiterConfig = {}) {
    this.limit = config.limit ?? 10;
    this.windowMs = parseDuration(config.window ?? "1m");
    this.storage = config.storage ?? new MemoryStorage();
    this.algorithm = config.algorithm ?? "fixed-window";
    this.keyGenerator = config.keyGenerator ?? ((req) => extractIp(req.headers));
    this.onLimitReached = config.onLimitReached;
    this.skipHeaders = config.skipHeaders ?? false;
    this.prefix = config.prefix ?? "rl";
  }

  /** Check the rate limit for a request without side effects. */
  async check(identifier: string): Promise<RateLimitResult> {
    const key = `${this.prefix}:${identifier}`;
    const windowSeconds = Math.ceil(this.windowMs / 1000);

    if (this.algorithm === "sliding-window") {
      return slidingWindow(key, this.limit, this.windowMs, this.storage);
    }

    return fixedWindow(key, this.limit, windowSeconds, this.storage);
  }

  /** Resolve the rate-limit key for a request. */
  async resolveKey(req: RequestLike): Promise<string> {
    return this.keyGenerator(req);
  }

  /** Full request pipeline — check + optional block. */
  async limit_(req: RequestLike): Promise<{
    result: RateLimitResult;
    /** Call this on the response to attach headers. */
    applyHeaders: (response: Response) => Response;
    /** Null when allowed; a ready-to-send Response when blocked. */
    blockedResponse: Response | null;
  }> {
    const identifier = await this.resolveKey(req);
    const result = await this.check(identifier);

    const applyHeaders = (res: Response): Response => {
      if (this.skipHeaders) return res;
      const headers = new Headers(res.headers);
      headers.set("X-RateLimit-Limit", String(result.limit));
      headers.set("X-RateLimit-Remaining", String(result.remaining));
      headers.set(
        "X-RateLimit-Reset",
        String(Math.ceil(result.reset / 1000))
      );
      if (!result.success) {
        headers.set("Retry-After", String(result.retryAfter));
      }
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    };

    if (result.success) {
      return { result, applyHeaders, blockedResponse: null };
    }

    // Blocked — build the 429 response
    let blockedResponse: Response;

    if (this.onLimitReached) {
      const custom = await this.onLimitReached(result, req);
      blockedResponse = custom ?? this.defaultBlockedResponse(result);
    } else {
      blockedResponse = this.defaultBlockedResponse(result);
    }

    return { result, applyHeaders, blockedResponse };
  }

  private defaultBlockedResponse(result: RateLimitResult): Response {
    const body = JSON.stringify({
      error: "Too Many Requests",
      retryAfter: result.retryAfter,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
      "Retry-After": String(result.retryAfter),
    };

    return new Response(body, { status: 429, headers });
  }

  /** Close the storage connection (e.g., Redis). */
  async close(): Promise<void> {
    await this.storage.close?.();
  }
}

/** Factory helper */
export function createRateLimiter(config?: RateLimiterConfig): RateLimiter {
  return new RateLimiter(config);
}
