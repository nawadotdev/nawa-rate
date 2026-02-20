# nawa-rate

Framework-agnostic rate limiting for Node.js — works with **Next.js**, **Express**, and any framework that speaks HTTP.

## Features

- Fixed-window and sliding-window algorithms
- In-memory storage (zero dependencies, single-instance)
- Redis storage (distributed, via `ioredis` or any compatible client)
- Tree-shakeable — only import what you need
- Full TypeScript support (strict mode)
- Tiny footprint, no runtime dependencies

## Installation

```bash
npm install @nawadotdev/nawa-rate
```

Peer dependencies (install only what you need):

```bash
npm install ioredis       # Redis storage
```

---

## Quick Start

### Express

```ts
import express from "express";
import { expressRateLimit } from "@nawadotdev/nawa-rate/express";

const app = express();

app.use(
  expressRateLimit({
    limit: 100,    // max requests
    window: "15m", // per window
  })
);

app.get("/", (req, res) => res.json({ ok: true }));
app.listen(3000);
```

### Next.js — Middleware (App Router)

Applies to all `/api` routes from a single location:

```ts
// middleware.ts
import { nextRateLimit } from "@nawadotdev/nawa-rate/next";
import { NextResponse } from "next/server";

const limiter = nextRateLimit({ limit: 60, window: "1m" });

export async function middleware(req: Request) {
  const blocked = await limiter(req);
  if (blocked) return blocked; // returns 429
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
```

### Next.js — Route Handler (App Router)

**1. Wrap with HOC (recommended)**

```ts
// app/api/posts/route.ts
import { withNextRateLimit } from "@nawadotdev/nawa-rate/next";

async function GET(req: Request) {
  const posts = await db.post.findMany();
  return Response.json(posts);
}

async function POST(req: Request) {
  const body = await req.json();
  const post = await db.post.create({ data: body });
  return Response.json(post, { status: 201 });
}

// Separate limits for GET and POST
export const GET  = withNextRateLimit(GET,  { limit: 100, window: "1m" });
export const POST = withNextRateLimit(POST, { limit: 10,  window: "1m" });
```

**2. Manual check (more control)**

```ts
// app/api/search/route.ts
import { nextRateLimit } from "@nawadotdev/nawa-rate/next";

const limiter = nextRateLimit({ limit: 30, window: "1m" });

export async function GET(req: Request) {
  const blocked = await limiter(req);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const results = await search(q);

  return Response.json({ results });
}
```

**3. User-based rate limiting (with auth)**

```ts
// app/api/ai/route.ts
import { createRateLimiter } from "@nawadotdev/nawa-rate";
import { getServerSession } from "next-auth";

const limiter = createRateLimiter({
  limit: 5,
  window: "1h",
  // Rate limit by user ID instead of IP
  keyGenerator: async (req) => {
    const session = await getServerSession();
    return session?.user?.id ?? req.ip ?? "anonymous";
  },
});

export async function POST(req: Request) {
  const { result, blockedResponse } = await limiter.limit_(req as never);

  if (blockedResponse) {
    return Response.json(
      { error: "Hourly limit of 5 requests reached.", retryAfter: result.retryAfter },
      { status: 429 }
    );
  }

  const body = await req.json();
  const response = await callAI(body.prompt);
  return Response.json({ response });
}
```

**4. Production with Redis**

```ts
// lib/rate-limiter.ts  (singleton)
import { createRateLimiter, RedisStorage } from "@nawadotdev/nawa-rate";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

export const apiLimiter = createRateLimiter({
  limit: 100,
  window: "15m",
  storage: new RedisStorage(redis),
});

// app/api/anything/route.ts
import { apiLimiter } from "@/lib/rate-limiter";

export async function GET(req: Request) {
  const { blockedResponse } = await apiLimiter.limit_(req as never);
  if (blockedResponse) return blockedResponse;

  return Response.json({ data: "..." });
}
```

### Next.js — Pages Router API Route

```ts
// pages/api/hello.ts
import { withRateLimit } from "@nawadotdev/nawa-rate/next";
import type { NextApiRequest, NextApiResponse } from "next";

function handler(req: NextApiRequest, res: NextApiResponse) {
  res.json({ message: "hello" });
}

export default withRateLimit(handler, { limit: 20, window: "1m" });
```

---

## Redis Storage

```ts
import { expressRateLimit } from "@nawadotdev/nawa-rate/express";
import { RedisStorage } from "@nawadotdev/nawa-rate";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

app.use(
  expressRateLimit({
    limit: 200,
    window: "1m",
    storage: new RedisStorage(redis),
  })
);
```

---

## Configuration

| Option           | Type                   | Default          | Description                                    |
| ---------------- | ---------------------- | ---------------- | ---------------------------------------------- |
| `limit`          | `number`               | `10`             | Max requests per window                        |
| `window`         | `string \| number`     | `"1m"`           | Window duration (`"10s"`, `"1m"`, `"2h"`, ms) |
| `algorithm`      | `string`               | `"fixed-window"` | `"fixed-window"` or `"sliding-window"`         |
| `storage`        | `StorageBackend`       | `MemoryStorage`  | Storage backend                                |
| `keyGenerator`   | `(req) => string`      | IP address       | Custom key function                            |
| `onLimitReached` | `(result, req) => Response` | —           | Custom 429 response handler                    |
| `skipHeaders`    | `boolean`              | `false`          | Disable `X-RateLimit-*` headers                |
| `prefix`         | `string`               | `"rl"`           | Storage key prefix                             |

### Duration format

| String  | Value       |
| ------- | ----------- |
| `"30s"` | 30 seconds  |
| `"1m"`  | 1 minute    |
| `"2h"`  | 2 hours     |
| `"1d"`  | 1 day       |
| `500`   | 500 ms (number passthrough) |

---

## Custom Key Generator

```ts
expressRateLimit({
  limit: 50,
  window: "1m",
  // Rate limit by user ID instead of IP
  keyGenerator: (req) => req.headers.get("x-user-id") ?? "anonymous",
});
```

---

## Response Headers

Every response includes:

| Header                | Value                                        |
| --------------------- | -------------------------------------------- |
| `X-RateLimit-Limit`   | Max requests in the window                   |
| `X-RateLimit-Remaining` | Requests left in the current window        |
| `X-RateLimit-Reset`   | Unix timestamp (seconds) when window resets  |
| `Retry-After`         | Seconds to wait (only when blocked)          |

---

## Low-Level API

Use `RateLimiter` directly for custom integrations:

```ts
import { createRateLimiter } from "@nawadotdev/nawa-rate";

const limiter = createRateLimiter({ limit: 5, window: "10s" });

// Check by identifier (does not require a Request object)
const result = await limiter.check("user:123");
console.log(result.success, result.remaining, result.reset);

// Full request pipeline
const { result, blockedResponse, applyHeaders } = await limiter.limit_(req);
if (blockedResponse) return blockedResponse;
return applyHeaders(new Response("ok"));
```

---

## License

MIT
