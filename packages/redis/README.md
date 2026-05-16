# @uplift-io/redis

Redis-backed async transforms for Uplift.

```ts
import { asyncTransforms, type RedisLike } from "@uplift-io/redis";
import { uplift, video } from "@uplift-io/uplift";

declare const redis: RedisLike;

export const uploads = uplift({
  storage,
  asyncTransforms: asyncTransforms(redis, {
    queueName: "uplift:async-transforms",
    keepOriginal: "failed",
    timeout: "10m",
    claimVisibilityTimeoutMs: 300_000
  }),
  routes: {
    clip: video().transformAsync(async ({ body }) => body)
  }
});
```

`queueName` is required. It is the Redis namespace shared by upload requests, status reads, and workers for one compatible Upload Contract. Use different queue names for different apps, environments, or incompatible route definitions. Workers reject queued Transform Jobs when the route contract no longer matches.

This package accepts a `RedisLike` object supplied by your application. It does not depend on a specific Redis client package. The object must expose Redis-compatible `get`, `set`, `del`, `lpush`, `rpop`, `zadd`, `zrangebyscore`, and `zrem` commands so claims can be leased, recovered, and completed safely across worker processes. Terminal writes are fenced by the active claim, so a stale worker cannot complete, fail, or clear a newer worker's recovered claim.

`claimVisibilityTimeoutMs` controls how long a processing claim is hidden from other workers before it can be recovered. The default is five minutes. Set it longer than the normal time between worker start and terminal completion for your transforms.
