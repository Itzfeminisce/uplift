import { describe, expect, it } from "vitest";
import { asyncTransforms, type RedisLike } from "@uplift-io/redis";
import { uplift, video, type UploadedFile } from "@uplift-io/uplift";
import { handleUploadRequest, runNextTransformJob } from "@uplift-io/uplift/server";

describe("@uplift-io/redis asyncTransforms", () => {
  it("persists async transform state through a RedisLike queue across app instances", async () => {
    const redis = new MemoryRedis();
    const storage = memoryStorage();
    const config = asyncTransforms(redis, {
      queueName: "uploads:video:v1"
    });
    const web = uplift({
      storage,
      asyncTransforms: config,
      routes: {
        clip: video().transformAsync(passThroughVideo)
      }
    });
    const worker = uplift({
      storage,
      asyncTransforms: asyncTransforms(redis, {
        queueName: "uploads:video:v1"
      }),
      routes: {
        clip: video().transformAsync(passThroughVideo)
      }
    });
    const statusServer = uplift({
      storage,
      asyncTransforms: asyncTransforms(redis, {
        queueName: "uploads:video:v1"
      }),
      routes: {
        clip: video().transformAsync(async ({ body }) => body)
      }
    });

    const accepted = await handleUploadRequest(web, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const queued = await handleUploadRequest(statusServer, new Request(`https://app.test/upload?job=${result.id}`));
    const completed = await runNextTransformJob(worker);
    const terminal = await handleUploadRequest(statusServer, new Request(`https://app.test/upload?job=${result.id}`));

    expect(config.keepOriginal).toBe("failed");
    expect(config.queueName).toBe("uploads:video:v1");
    expect(await queued.json()).toMatchObject({ id: result.id, status: "queued" });
    expect(completed).toMatchObject({ id: result.id, status: "completed" });
    expect(await terminal.json()).toMatchObject({ id: result.id, status: "completed", result: { type: "video/mp4" } });
  });

  it("rejects an empty queueName", () => {
    expect(() => asyncTransforms(new MemoryRedis(), { queueName: "" })).toThrow("queueName");
  });

  it("claims Redis Transform Jobs once across competing direct and next workers", async () => {
    const redis = new MemoryRedis();
    const queue = asyncTransforms(redis, { queueName: "uploads:claims:v1" }).queue;
    const job = await queue!.create({
      route: "clip",
      original: {
        key: "__uplift/originals/job_1/clip.mp4",
        file: { name: "clip.mp4", type: "video/mp4", size: 3 }
      },
      keepOriginal: false
    });

    const [direct, next] = await Promise.all([queue!.claim(job.id), queue!.claimNext()]);

    expect([direct?.id, next?.id].filter(Boolean)).toEqual([job.id]);
    await expect(queue!.read(job.id)).resolves.toMatchObject({ status: "processing" });
  });

  it("recovers stale Redis claims after the visibility timeout", async () => {
    const redis = new MemoryRedis();
    const queue = asyncTransforms(redis, {
      queueName: "uploads:recovery:v1",
      claimVisibilityTimeoutMs: 1
    }).queue;
    const job = await queue!.create({
      route: "clip",
      original: {
        key: "__uplift/originals/job_1/clip.mp4",
        file: { name: "clip.mp4", type: "video/mp4", size: 3 }
      },
      keepOriginal: false
    });

    const first = await queue!.claimNext();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const recovered = await queue!.claimNext();

    expect(first).toMatchObject({ id: job.id, status: "processing" });
    expect(recovered).toMatchObject({ id: job.id, status: "processing" });
  });

  it("does not let a stale Redis worker complete after another worker recovers the claim", async () => {
    const redis = new MemoryRedis();
    const queue = asyncTransforms(redis, {
      queueName: "uploads:fenced-complete:v1",
      claimVisibilityTimeoutMs: 100
    }).queue!;
    const job = await queue.create({
      route: "clip",
      original: {
        key: "__uplift/originals/job_1/clip.mp4",
        file: { name: "clip.mp4", type: "video/mp4", size: 3 }
      },
      keepOriginal: false
    });

    const stale = await queue.claimNext();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const current = await queue.claimNext();
    const staleComplete = await queue.complete(job.id, {
      primary: { key: "late.mp4", url: "memory://late.mp4", name: "late.mp4", type: "video/mp4", size: 3, provider: "memory" }
    }, stale?.claimToken);
    const completed = await queue.complete(job.id, {
      primary: { key: "current.mp4", url: "memory://current.mp4", name: "current.mp4", type: "video/mp4", size: 3, provider: "memory" }
    }, current?.claimToken);

    expect(stale?.claimToken).toEqual(expect.any(String));
    expect(current?.claimToken).toEqual(expect.any(String));
    expect(current?.claimToken).not.toBe(stale?.claimToken);
    expect(staleComplete).toMatchObject({ id: job.id, status: "processing" });
    expect(completed).toMatchObject({ id: job.id, status: "completed", result: { primary: { key: "current.mp4" } } });
    await expect(queue.read(job.id)).resolves.toMatchObject({ status: "completed", result: { primary: { key: "current.mp4" } } });
  });

  it("rolls back stale worker outputs when Redis completion loses claim ownership", async () => {
    const redis = new MemoryRedis();
    const deleted: string[] = [];
    const routeDone: string[] = [];
    const uploadComplete: string[] = [];
    const completedListeners: string[] = [];
    let finalWrite = 0;
    let delayedStaleOutput = false;
    const storage = memoryStorage({
      onPut: async (key) => {
        if (!delayedStaleOutput && key.includes("/outputs/poster")) {
          delayedStaleOutput = true;
          await new Promise((resolve) => setTimeout(resolve, 70));
        }
      },
      onDelete: (key) => {
        deleted.push(key);
      }
    });
    const config = asyncTransforms(redis, {
      queueName: "uploads:stale-output-cleanup:v1",
      claimVisibilityTimeoutMs: 50
    });
    const app = uplift({
      storage,
      asyncTransforms: config,
      onUploadComplete: async ({ result }) => {
        uploadComplete.push((result as UploadedFile).key);
      },
      routes: {
        clip: video()
          .key(() => {
            finalWrite += 1;
            return `final/${finalWrite}.mp4`;
          })
          .transformAsync(passThroughVideo)
          .outputs({
            name: "poster" as const,
            produce: async () => new File(["poster"], "poster.jpg", { type: "image/jpeg" })
          })
          .done(({ file }) => {
            routeDone.push(file.key);
          })
          .listeners({
            completed: ({ result }) => {
              completedListeners.push(result.key);
            }
          })
      }
    });

    const accepted = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const stale = await runNextTransformJob(app);

    expect(stale).toMatchObject({ id: result.id, status: "processing" });
    expect(deleted).toEqual(["final/1.mp4/outputs/poster.jpg", "final/1.mp4"]);
    expect(routeDone).toEqual([]);
    expect(uploadComplete).toEqual([]);
    expect(completedListeners).toEqual([]);

    const current = await runNextTransformJob(app);

    expect(current).toMatchObject({ id: result.id, status: "completed", result: { primary: { key: "final/2.mp4" } } });
    expect(storage.keys()).toEqual(expect.arrayContaining(["final/2.mp4", "final/2.mp4/outputs/poster.jpg"]));
    expect(storage.keys()).not.toEqual(expect.arrayContaining(["final/1.mp4", "final/1.mp4/outputs/poster.jpg"]));
    expect(routeDone).toEqual(["final/2.mp4"]);
    expect(uploadComplete).toEqual(["final/2.mp4"]);
    expect(completedListeners).toEqual(["final/2.mp4"]);
  });

  it("accepts Redis completion before running success hooks", async () => {
    const redis = new MemoryRedis();
    const deleted: string[] = [];
    const routeDone: string[] = [];
    const uploadComplete: string[] = [];
    const completedListeners: string[] = [];
    let finalWrite = 0;
    let delayedStaleDone = false;
    const storage = memoryStorage({
      onDelete: (key) => {
        deleted.push(key);
      }
    });
    const app = uplift({
      storage,
      asyncTransforms: asyncTransforms(redis, {
        queueName: "uploads:stale-hook-cleanup:v1",
        claimVisibilityTimeoutMs: 50
      }),
      onUploadComplete: async ({ result }) => {
        uploadComplete.push((result as UploadedFile).key);
      },
      routes: {
        clip: video()
          .key(() => {
            finalWrite += 1;
            return `final/hook-${finalWrite}.mp4`;
          })
          .transformAsync(passThroughVideo)
          .outputs({
            name: "poster" as const,
            produce: async () => new File(["poster"], "poster.jpg", { type: "image/jpeg" })
          })
          .done(async ({ file }) => {
            if (!delayedStaleDone) {
              delayedStaleDone = true;
              await new Promise((resolve) => setTimeout(resolve, 70));
            }
            routeDone.push(file.key);
          })
          .listeners({
            completed: ({ result }) => {
              completedListeners.push(result.key);
            }
          })
      }
    });

    const accepted = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const completed = await runNextTransformJob(app);

    expect(completed).toMatchObject({ id: result.id, status: "completed", result: { primary: { key: "final/hook-1.mp4" } } });
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toContain("__uplift/originals/");
    expect(storage.keys()).toEqual(expect.arrayContaining(["final/hook-1.mp4", "final/hook-1.mp4/outputs/poster.jpg"]));
    expect(routeDone).toEqual(["final/hook-1.mp4"]);
    expect(uploadComplete).toEqual(["final/hook-1.mp4"]);
    expect(completedListeners).toEqual(["final/hook-1.mp4"]);
  });

  it("does not let a stale Redis worker fail or clear another worker's active claim", async () => {
    const redis = new MemoryRedis();
    const queue = asyncTransforms(redis, {
      queueName: "uploads:fenced-fail:v1",
      claimVisibilityTimeoutMs: 100
    }).queue!;
    const job = await queue.create({
      route: "clip",
      original: {
        key: "__uplift/originals/job_1/clip.mp4",
        file: { name: "clip.mp4", type: "video/mp4", size: 3 }
      },
      keepOriginal: false
    });

    const stale = await queue.claimNext();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const current = await queue.claimNext();
    const staleFailure = await queue.fail(job.id, new Error("late failure"), stale?.claimToken);
    const completed = await queue.complete(job.id, {
      primary: { key: "current.mp4", url: "memory://current.mp4", name: "current.mp4", type: "video/mp4", size: 3, provider: "memory" }
    }, current?.claimToken);

    expect(staleFailure).toMatchObject({ id: job.id, status: "processing" });
    expect(completed).toMatchObject({ id: job.id, status: "completed", result: { primary: { key: "current.mp4" } } });
  });

  it("does not let no-token Redis callers complete claimed jobs after claim expiry", async () => {
    const redis = new MemoryRedis();
    const queue = asyncTransforms(redis, {
      queueName: "uploads:expired-no-token-complete:v1",
      claimVisibilityTimeoutMs: 1
    }).queue!;
    const job = await queue.create({
      route: "clip",
      original: {
        key: "__uplift/originals/job_1/clip.mp4",
        file: { name: "clip.mp4", type: "video/mp4", size: 3 }
      },
      keepOriginal: false
    });

    await queue.claimNext();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const noTokenComplete = await queue.complete(job.id, {
      primary: { key: "late.mp4", url: "memory://late.mp4", name: "late.mp4", type: "video/mp4", size: 3, provider: "memory" }
    });

    expect(noTokenComplete).toMatchObject({ id: job.id, status: "processing" });
    await expect(queue.read(job.id)).resolves.toMatchObject({ status: "processing" });
  });

  it("does not let no-token Redis callers fail claimed jobs after claim expiry", async () => {
    const redis = new MemoryRedis();
    const queue = asyncTransforms(redis, {
      queueName: "uploads:expired-no-token-fail:v1",
      claimVisibilityTimeoutMs: 1
    }).queue!;
    const job = await queue.create({
      route: "clip",
      original: {
        key: "__uplift/originals/job_1/clip.mp4",
        file: { name: "clip.mp4", type: "video/mp4", size: 3 }
      },
      keepOriginal: false
    });

    await queue.claimNext();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const noTokenFailure = await queue.fail(job.id, new Error("late failure"));

    expect(noTokenFailure).toMatchObject({ id: job.id, status: "processing" });
    await expect(queue.read(job.id)).resolves.toMatchObject({ status: "processing" });
  });

  it("returns a storage error and does not leave a runnable job when Redis queue push fails", async () => {
    const redis = new MemoryRedis({
      failLpushOnce: true
    });
    const storage = memoryStorage();
    const app = uplift({
      storage,
      asyncTransforms: asyncTransforms(redis, { queueName: "uploads:enqueue:v1" }),
      routes: {
        clip: video().transformAsync(async ({ body }) => body)
      }
    });

    const response = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=clip"));
    const body = await response.json() as { error: { code: string; message: string } };
    const next = await asyncTransforms(redis, { queueName: "uploads:enqueue:v1" }).queue!.claimNext();

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({ code: "STORAGE_FAILED" });
    expect(next).toBeUndefined();
    expect(storage.keys()).toEqual([]);
  });

  it("quarantines malformed Redis payloads as provider-neutral failed jobs", async () => {
    const redis = new MemoryRedis();
    const config = asyncTransforms(redis, { queueName: "uploads:malformed:v1" });
    const queue = config.queue!;
    await redis.set("uplift:uploads:malformed:v1:jobs:job_bad", "{not-json");
    await redis.lpush("uplift:uploads:malformed:v1:queued", "job_bad");

    const claimed = await queue.claimNext();
    const status = await queue.read("job_bad");

    expect(claimed).toBeUndefined();
    expect(status).toMatchObject({
      id: "job_bad",
      status: "failed",
      error: { code: "VALIDATION_FAILED" }
    });
  });

  it("returns malformed Redis JSON as a failed Transform Job on the first status read", async () => {
    const redis = new MemoryRedis();
    const app = uplift({
      storage: memoryStorage(),
      asyncTransforms: asyncTransforms(redis, { queueName: "uploads:status-json:v1" }),
      routes: {
        clip: video().transformAsync(passThroughVideo)
      }
    });
    await redis.set("uplift:uploads:status-json:v1:jobs:job_bad", "{not-json");

    const response = await handleUploadRequest(app, new Request("https://app.test/upload?job=job_bad"));
    const firstRead = await response.json();
    const secondRead = await handleUploadRequest(app, new Request("https://app.test/upload?job=job_bad"));

    expect(response.status).toBe(200);
    expect(firstRead).toMatchObject({ id: "job_bad", status: "failed", error: { code: "VALIDATION_FAILED" } });
    expect(JSON.stringify(firstRead)).not.toContain("JSON");
    await expect(secondRead.json()).resolves.toMatchObject({ id: "job_bad", status: "failed", error: { code: "VALIDATION_FAILED" } });
  });

  it("returns wrong-shape Redis payloads as failed Transform Jobs on the first status read", async () => {
    const redis = new MemoryRedis();
    const app = uplift({
      storage: memoryStorage(),
      asyncTransforms: asyncTransforms(redis, { queueName: "uploads:status-shape:v1" }),
      routes: {
        clip: video().transformAsync(passThroughVideo)
      }
    });
    await redis.set("uplift:uploads:status-shape:v1:jobs:job_bad", JSON.stringify({ schemaVersion: 1, id: "job_bad", status: "queued" }));

    const response = await handleUploadRequest(app, new Request("https://app.test/upload?job=job_bad"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: "job_bad", status: "failed", error: { code: "VALIDATION_FAILED" } });
  });

  it("persists route-contract drift failures through Redis claims and status reads", async () => {
    const redis = new MemoryRedis();
    const storage = memoryStorage();
    const web = uplift({
      storage,
      asyncTransforms: asyncTransforms(redis, { queueName: "uploads:drift:v1" }),
      routes: {
        clip: video()
          .transformAsync(passThroughVideo)
          .outputs({ name: "poster" as const, produce: async ({ body }) => body })
      }
    });
    const worker = uplift({
      storage,
      asyncTransforms: asyncTransforms(redis, { queueName: "uploads:drift:v1" }),
      routes: {
        clip: video().transformAsync(passThroughVideo)
      }
    });
    const statusServer = uplift({
      storage,
      asyncTransforms: asyncTransforms(redis, { queueName: "uploads:drift:v1" }),
      routes: {
        clip: video().transformAsync(passThroughVideo)
      }
    });

    const accepted = await handleUploadRequest(web, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const failed = await runNextTransformJob(worker);
    const status = await handleUploadRequest(statusServer, new Request(`https://app.test/upload?job=${result.id}`));

    expect(failed).toMatchObject({
      id: result.id,
      status: "failed",
      error: { code: "VALIDATION_FAILED", message: "Transform Job route contract no longer matches the worker upload contract." }
    });
    expect(await status.json()).toMatchObject({
      id: result.id,
      status: "failed",
      error: { code: "VALIDATION_FAILED" }
    });
  });

  it("persists missing-route failures through Redis claims and status reads", async () => {
    const redis = new MemoryRedis();
    const storage = memoryStorage();
    const web = uplift({
      storage,
      asyncTransforms: asyncTransforms(redis, { queueName: "uploads:missing-route:v1" }),
      routes: {
        clip: video().transformAsync(passThroughVideo)
      }
    });
    const worker = uplift({
      storage,
      asyncTransforms: asyncTransforms(redis, { queueName: "uploads:missing-route:v1" }),
      routes: {
        other: video().transformAsync(passThroughVideo)
      }
    });
    const statusServer = uplift({
      storage,
      asyncTransforms: asyncTransforms(redis, { queueName: "uploads:missing-route:v1" }),
      routes: {
        clip: video().transformAsync(passThroughVideo)
      }
    });

    const accepted = await handleUploadRequest(web, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const failed = await runNextTransformJob(worker);
    const status = await handleUploadRequest(statusServer, new Request(`https://app.test/upload?job=${result.id}`));

    expect(failed).toMatchObject({
      id: result.id,
      status: "failed",
      error: { code: "UNKNOWN_ROUTE", message: "Unknown async transform route: clip" }
    });
    expect(await status.json()).toMatchObject({
      id: result.id,
      status: "failed",
      error: { code: "UNKNOWN_ROUTE" }
    });
  });
});

class MemoryRedis implements RedisLike {
  private readonly values = new Map<string, string>();
  private readonly expiresAt = new Map<string, number>();
  private readonly lists = new Map<string, string[]>();
  private readonly sortedSets = new Map<string, Map<string, number>>();

  constructor(private readonly options: { failLpushOnce?: boolean } = {}) {}

  get(key: string) {
    this.deleteIfExpired(key);
    return this.values.get(key) ?? null;
  }

  set(key: string, value: string, ...args: unknown[]) {
    this.deleteIfExpired(key);
    if (args.includes("NX") && this.values.has(key)) return null;
    this.values.set(key, value);
    const pxIndex = args.findIndex((arg) => arg === "PX");
    if (pxIndex >= 0) {
      this.expiresAt.set(key, Date.now() + Number(args[pxIndex + 1]));
    } else {
      this.expiresAt.delete(key);
    }
    return "OK";
  }

  lpush(key: string, value: string) {
    if (this.options.failLpushOnce) {
      this.options.failLpushOnce = false;
      throw new Error("redis push failed");
    }
    const list = this.lists.get(key) ?? [];
    list.unshift(value);
    this.lists.set(key, list);
    return list.length;
  }

  rpop(key: string) {
    const list = this.lists.get(key) ?? [];
    return list.pop() ?? null;
  }

  del(key: string) {
    this.values.delete(key);
    this.expiresAt.delete(key);
    this.lists.delete(key);
    this.sortedSets.delete(key);
    return 1;
  }

  zadd(key: string, score: number, member: string) {
    const set = this.sortedSets.get(key) ?? new Map<string, number>();
    set.set(member, score);
    this.sortedSets.set(key, set);
    return 1;
  }

  zrangebyscore(key: string, min: number | string, max: number | string, ...args: unknown[]) {
    const minScore = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
    const maxScore = max === "+inf" ? Number.POSITIVE_INFINITY : Number(max);
    let values = [...(this.sortedSets.get(key) ?? new Map<string, number>()).entries()]
      .filter(([, score]) => score >= minScore && score <= maxScore)
      .sort((a, b) => a[1] - b[1])
      .map(([member]) => member);
    const limitIndex = args.findIndex((arg) => arg === "LIMIT");
    if (limitIndex >= 0) {
      const offset = Number(args[limitIndex + 1]);
      const count = Number(args[limitIndex + 2]);
      values = values.slice(offset, offset + count);
    }
    return values;
  }

  zrem(key: string, member: string) {
    return this.sortedSets.get(key)?.delete(member) ? 1 : 0;
  }

  private deleteIfExpired(key: string) {
    const expiresAt = this.expiresAt.get(key);
    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      this.values.delete(key);
      this.expiresAt.delete(key);
    }
  }
}

function uploadRequest(url: string) {
  const form = new FormData();
  form.append("file", new File(["raw"], "clip.mp4", { type: "video/mp4" }));
  return new Request(url, { method: "POST", body: form });
}

async function passThroughVideo({ body }: { body: File }) {
  return new File([await body.text()], "clip.mp4", { type: "video/mp4" });
}

function memoryStorage(options: {
  onPut?: (key: string) => void | Promise<void>;
  onDelete?: (key: string) => void | Promise<void>;
} = {}) {
  const objects = new Map<string, File>();
  return {
    provider: "memory",
    put: async ({ key, file, body }: { key: string; file: { name: string; type: string; size: number }; body: File }) => {
      objects.set(key, body);
      await options.onPut?.(key);
      return { key, url: `memory://${key}`, name: file.name, type: file.type, size: file.size, provider: "memory" } satisfies UploadedFile;
    },
    get: async (key: string) => objects.get(key),
    delete: async (key: string) => {
      objects.delete(key);
      await options.onDelete?.(key);
    },
    keys: () => [...objects.keys()]
  };
}
