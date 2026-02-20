import type { IncrementResult, StorageBackend } from "../types.js";

interface Entry {
  count: number;
  windowExpires: number;
}

/**
 * In-process memory storage.
 * Not suitable for multi-instance deployments — use Redis instead.
 */
export class MemoryStorage implements StorageBackend {
  private readonly store = new Map<string, Entry>();
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(cleanupIntervalMs = 60_000) {
    // Periodically remove expired entries to prevent memory leaks
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);

    // Allow the process to exit even if timer is active
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  async increment(key: string, ttlSeconds: number): Promise<IncrementResult> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (existing && existing.windowExpires > now) {
      existing.count += 1;
      return { count: existing.count, windowExpires: existing.windowExpires };
    }

    const windowExpires = now + ttlSeconds * 1000;
    this.store.set(key, { count: 1, windowExpires });
    return { count: 1, windowExpires };
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -1;
    const remaining = entry.windowExpires - Date.now();
    return remaining > 0 ? remaining : -1;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async close(): Promise<void> {
    if (this.cleanupTimer !== undefined) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.store.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.windowExpires <= now) {
        this.store.delete(key);
      }
    }
  }
}
