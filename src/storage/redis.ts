import type { IncrementResult, StorageBackend } from "../types.js";

/**
 * Minimal interface — compatible with both `ioredis` and `@upstash/redis`.
 */
export interface RedisLike {
  evalsha?: (sha: string, numkeys: number, ...args: (string | number)[]) => Promise<unknown>;
  sendCommand?: (...args: string[]) => Promise<unknown>;
  /** ioredis-style eval */
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
  pttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
  quit?(): Promise<unknown>;
}

/**
 * Lua script for atomic fixed-window increment.
 * KEYS[1] = storage key
 * ARGV[1] = TTL in milliseconds
 * ARGV[2] = current timestamp in ms
 * Returns [count, windowExpires]
 */
const INCREMENT_SCRIPT = [
  "local key    = KEYS[1]",
  "local ttl_ms = tonumber(ARGV[1])",
  "local now    = tonumber(ARGV[2])",
  "local count  = redis.call('INCR', key)",
  "if count == 1 then",
  "  redis.call('PEXPIRE', key, ttl_ms)",
  "end",
  "local pttl = redis.call('PTTL', key)",
  "local expires = now + (pttl > 0 and pttl or ttl_ms)",
  "return {count, expires}",
].join("\n");

export class RedisStorage implements StorageBackend {
  constructor(private readonly client: RedisLike) {}

  async increment(key: string, ttlSeconds: number): Promise<IncrementResult> {
    const ttlMs = ttlSeconds * 1000;
    const now = Date.now();

    // redis.eval() is the Redis Lua scripting API — not JavaScript eval
    const result = (await this.client.eval(
      INCREMENT_SCRIPT,
      1,
      key,
      String(ttlMs),
      String(now)
    )) as [number, number];

    return {
      count: result[0]!,
      windowExpires: result[1]!,
    };
  }

  async ttl(key: string): Promise<number> {
    const pttl = await this.client.pttl(key);
    return pttl > 0 ? pttl : -1;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async close(): Promise<void> {
    await this.client.quit?.();
  }
}
