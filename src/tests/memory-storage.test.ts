import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "../storage/memory.js";

describe("MemoryStorage", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  afterEach(async () => {
    await storage.close();
  });

  it("starts count at 1", async () => {
    const result = await storage.increment("key1", 60);
    expect(result.count).toBe(1);
    expect(result.windowExpires).toBeGreaterThan(Date.now());
  });

  it("increments within the same window", async () => {
    await storage.increment("key2", 60);
    await storage.increment("key2", 60);
    const result = await storage.increment("key2", 60);
    expect(result.count).toBe(3);
  });

  it("resets after window expiry", async () => {
    // Use a very short TTL
    await storage.increment("key3", 0.001); // ~1ms TTL
    await new Promise((r) => setTimeout(r, 10));
    const result = await storage.increment("key3", 60);
    expect(result.count).toBe(1);
  });

  it("ttl returns -1 for missing keys", async () => {
    expect(await storage.ttl("nonexistent")).toBe(-1);
  });

  it("ttl returns positive ms for existing keys", async () => {
    await storage.increment("key4", 60);
    const ttl = await storage.ttl("key4");
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  it("delete removes the key", async () => {
    await storage.increment("key5", 60);
    await storage.delete("key5");
    const result = await storage.increment("key5", 60);
    expect(result.count).toBe(1);
  });
});
