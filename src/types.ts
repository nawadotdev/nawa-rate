// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** Duration string shorthand, e.g. "10s", "1m", "2h", "1d" */
export type DurationString = `${number}${"ms" | "s" | "m" | "h" | "d"}`;

/** Parsed duration in milliseconds */
export type DurationMs = number;

/** Result returned after each rate-limit check */
export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Max requests allowed in the window */
  limit: number;
  /** Remaining requests in the current window */
  remaining: number;
  /** UNIX timestamp (ms) when the window resets */
  reset: number;
  /** Retry-After seconds when blocked */
  retryAfter: number;
}

/** Headers to attach to HTTP responses */
export interface RateLimitHeaders {
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
  "Retry-After"?: string;
}

// ---------------------------------------------------------------------------
// Algorithm
// ---------------------------------------------------------------------------

export type Algorithm = "fixed-window" | "sliding-window";

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface StorageBackend {
  /** Increment counter and return the new value. TTL in seconds. */
  increment(key: string, ttlSeconds: number): Promise<IncrementResult>;
  /** Get remaining TTL in milliseconds, -1 if key absent */
  ttl(key: string): Promise<number>;
  /** Delete a key (used for tests / manual resets) */
  delete(key: string): Promise<void>;
  /** Graceful shutdown */
  close?(): Promise<void>;
}

export interface IncrementResult {
  count: number;
  /** UNIX ms timestamp when this window expires */
  windowExpires: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RateLimiterConfig {
  /**
   * Maximum number of requests allowed within the window.
   * @default 10
   */
  limit?: number;

  /**
   * Time window as a duration string or milliseconds.
   * @default "1m"
   */
  window?: DurationString | DurationMs;

  /**
   * Algorithm to use.
   * @default "fixed-window"
   */
  algorithm?: Algorithm;

  /**
   * Storage backend. Defaults to in-memory.
   */
  storage?: StorageBackend;

  /**
   * Custom key generator. Receives a generic request-like object.
   * Defaults to IP-based key.
   */
  keyGenerator?: (req: RequestLike) => string | Promise<string>;

  /**
   * Custom handler called when rate limit is exceeded.
   * Return a Response to short-circuit, or undefined to use the default.
   */
  onLimitReached?: (
    result: RateLimitResult,
    req: RequestLike
  ) => Response | undefined | Promise<Response | undefined>;

  /**
   * Whether to skip adding rate limit headers to responses.
   * @default false
   */
  skipHeaders?: boolean;

  /**
   * Prefix prepended to all storage keys.
   * @default "rl"
   */
  prefix?: string;
}

// ---------------------------------------------------------------------------
// Request abstraction — works for Node IncomingMessage, Fetch Request, etc.
// ---------------------------------------------------------------------------

export interface RequestLike {
  /** Full URL or pathname */
  url?: string | undefined;
  /** HTTP method */
  method?: string | undefined;
  /** Header accessor */
  headers: HeadersLike;
  /** Remote IP — populated by adapters */
  ip?: string | undefined;
}

export interface HeadersLike {
  get(name: string): string | null;
  /** Node.js IncomingMessage headers shape — index signature allows both Web Headers and plain objects */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
