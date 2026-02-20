import type { DurationMs, DurationString } from "../types.js";

const UNIT_MAP: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parse a duration string like "10s", "1m", "2h" into milliseconds.
 * Passing a plain number is treated as already in milliseconds.
 */
export function parseDuration(input: DurationString | DurationMs): number {
  if (typeof input === "number") return input;

  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(input);
  if (!match) {
    throw new TypeError(
      `Invalid duration: "${input}". Use format like "10s", "1m", "2h", "1d", "500ms".`
    );
  }

  const value = parseFloat(match[1]!);
  const multiplier = UNIT_MAP[match[2]!]!;
  return Math.ceil(value * multiplier);
}
