import type { HeadersLike } from "../types.js";

/** Common proxy headers, in priority order */
const PROXY_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "x-client-ip",
  "x-cluster-client-ip",
  "forwarded-for",
  "forwarded",
] as const;

/**
 * Extract the best-guess client IP from request headers.
 * Returns "unknown" when nothing can be determined.
 */
export function extractIp(headers: HeadersLike): string {
  for (const header of PROXY_HEADERS) {
    const raw = getHeader(headers, header);
    if (!raw) continue;
    // x-forwarded-for may be comma-separated; take the first (leftmost) address
    const ip = raw.split(",")[0]?.trim();
    if (ip) return ip;
  }
  return "unknown";
}

function getHeader(headers: HeadersLike, name: string): string | null {
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  // Node.js IncomingMessage.headers is a plain object
  const val = (headers as Record<string, unknown>)[name];
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return (val[0] as string | undefined) ?? null;
  return null;
}
