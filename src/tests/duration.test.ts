import { describe, expect, it } from "vitest";
import { parseDuration } from "../utils/duration.js";

describe("parseDuration", () => {
  it("parses milliseconds passthrough", () => {
    expect(parseDuration(5000)).toBe(5000);
  });

  it("parses ms suffix", () => {
    expect(parseDuration("500ms")).toBe(500);
  });

  it("parses seconds", () => {
    expect(parseDuration("30s")).toBe(30_000);
  });

  it("parses minutes", () => {
    expect(parseDuration("1m")).toBe(60_000);
  });

  it("parses hours", () => {
    expect(parseDuration("2h")).toBe(7_200_000);
  });

  it("parses days", () => {
    expect(parseDuration("1d")).toBe(86_400_000);
  });

  it("parses decimal values", () => {
    expect(parseDuration("1.5m")).toBe(90_000);
  });

  it("throws on invalid format", () => {
    expect(() => parseDuration("10x" as never)).toThrow("Invalid duration");
  });
});
