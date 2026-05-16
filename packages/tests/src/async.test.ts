import { describe, expect, it } from "vitest";
import { UploadError, uplift, video, type UploadedFile } from "@uplift-io/uplift";
import { createUploadClient } from "@uplift-io/uplift/client";
import {
  assertTransformJobKeysDoNotCollide,
  createMemoryTransformQueue,
  createTransformJobStore,
  handleUploadRequest,
  normalizeTransformJobError,
  runNextTransformJob,
  runTransformJob
} from "@uplift-io/uplift/server";

const inputFile = {
  name: "clip.mp4",
  type: "video/mp4",
  size: 12,
  extension: "mp4"
};

const uploaded: UploadedFile = {
  key: "final/clip.mp4",
  url: "memory://final/clip.mp4",
  name: "clip.mp4",
  type: "video/mp4",
  size: 12,
  provider: "memory"
};

describe("async transform jobs", () => {
  it("creates queued jobs with collision-resistant ids and Original Upload keys", () => {
    let idCall = 0;
    let keyCall = 0;
    const store = createTransformJobStore({
      idFactory: () => (idCall++ === 0 ? "job_same" : `job_${idCall}`),
      originalKeyFactory: () => (keyCall++ === 0 ? "original_same" : `original_${keyCall}`)
    });

    const first = store.create({
      route: "clip",
      original: { file: inputFile },
      metadata: { owner: "user_1" },
      keepOriginal: false
    });
    const second = store.create({
      route: "clip",
      original: { file: inputFile },
      keepOriginal: false
    });

    expect(first).toMatchObject({
      id: "job_same",
      route: "clip",
      status: "queued",
      metadata: { owner: "user_1" },
      original: { key: "original_same", file: inputFile }
    });
    expect(second.id).not.toBe(first.id);
    expect(second.original.key).not.toBe(first.original.key);
    expect(store.listQueued()).toHaveLength(2);
  });

  it("keeps status transitions monotonic after terminal states", () => {
    const store = createTransformJobStore({ idFactory: () => "job_1" });
    const job = store.create({
      route: "clip",
      original: { file: inputFile },
      keepOriginal: false
    });

    expect(store.markProcessing(job.id, { message: "starting" })).toMatchObject({
      status: "processing",
      progress: { message: "starting" }
    });
    expect(store.complete(job.id, { primary: uploaded })).toMatchObject({
      status: "completed",
      result: { primary: uploaded }
    });
    expect(store.fail(job.id, new Error("late failure"))).toMatchObject({
      status: "completed",
      result: { primary: uploaded }
    });
  });

  it("normalizes failures to provider-neutral Upload Errors", () => {
    const store = createTransformJobStore({ idFactory: () => "job_1" });
    const job = store.create({
      route: "clip",
      original: { file: inputFile },
      keepOriginal: false
    });

    expect(store.fail(job.id, new UploadError("TRANSFORM_FAILED", "ffmpeg failed"))).toMatchObject({
      status: "failed",
      error: { code: "TRANSFORM_FAILED", message: "ffmpeg failed" }
    });
    expect(normalizeTransformJobError(new Error("plain"))).toEqual({
      code: "UNKNOWN",
      message: "plain"
    });
  });

  it("applies Original Upload cleanup policy only after terminal states", () => {
    const store = createTransformJobStore();
    const keepNever = store.create({ route: "clip", original: { file: inputFile }, keepOriginal: false });
    const keepFailed = store.create({ route: "clip", original: { file: inputFile }, keepOriginal: "failed" });
    const keepAlways = store.create({ route: "clip", original: { file: inputFile }, keepOriginal: true });

    expect(store.shouldDeleteOriginal(keepNever)).toBe(false);
    expect(store.shouldDeleteOriginal(store.complete(keepNever.id, { primary: uploaded }))).toBe(true);
    expect(store.shouldDeleteOriginal(store.complete(keepFailed.id, { primary: uploaded }))).toBe(true);
    expect(store.shouldDeleteOriginal(store.fail(keepAlways.id, new Error("failed")))).toBe(false);
  });

  it("rejects final primary key collisions with the Original Upload key", () => {
    const store = createTransformJobStore({
      idFactory: () => "job_1",
      originalKeyFactory: () => "same-key"
    });
    const job = store.create({
      route: "clip",
      original: { file: inputFile },
      keepOriginal: false
    });

    expect(() => assertTransformJobKeysDoNotCollide("same-key", "same-key")).toThrow("Final primary key");
    expect(() => store.complete(job.id, { primary: { ...uploaded, key: "same-key" } })).toThrow("Final primary key");
  });

  it("accepts async uploads, runs worker transforms, and resolves client done()", async () => {
    const written: string[] = [];
    const deleted: string[] = [];
    const completed: string[] = [];
    const listenerStatuses: string[] = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => {
          written.push(key);
          return {
            key,
            url: `memory://${key}`,
            name: file.name,
            type: file.type,
            size: file.size,
            provider: "memory"
          };
        },
        delete: async (key) => {
          deleted.push(key);
        }
      },
      asyncTransforms: { keepOriginal: false },
      onUploadComplete: async ({ route }) => {
        completed.push(route);
      },
      routes: {
        clip: video()
          .transformAsync(async ({ body }) => new File([`${await body.text()} transformed`], "clip.mp4", { type: "video/mp4" }))
          .outputs({
            name: "poster" as const,
            produce: async () => new File(["poster"], "poster.jpg", { type: "image/jpeg" })
          })
          .listeners({
            queued: ({ status, route }) => {
              listenerStatuses.push(`${route}:${status}`);
            },
            processing: ({ status }) => {
              listenerStatuses.push(status);
            },
            completed: ({ status, result }) => {
              listenerStatuses.push(`${status}:${result.outputs?.poster?.type}`);
              throw new Error("listener diagnostics only");
            },
            failed: ({ status }) => {
              listenerStatuses.push(status);
            }
          })
          .done(({ file }) => {
            expect(file.outputs?.poster?.key).toMatch(/\/clip\.mp4\/outputs\/poster\.jpg$/);
          })
      }
    });

    const upload = createUploadClient<typeof app>("https://app.test/upload", {
      fetch: async (url, init) => {
        const response = await handleUploadRequest(app, new Request(url, init));
        if (init?.method === "POST") {
          const { result } = await response.clone().json() as { result: { id: string } };
          await runTransformJob(app, result.id);
        }
        return response;
      }
    });

    const transform = await upload.clip(new File(["raw"], "clip.mp4", { type: "video/mp4" }));
    expect(transform).toMatchObject({ route: "clip", status: "queued" });
    const result = await transform.done();

    expect(result).toMatchObject({ type: "video/mp4" });
    expect(result.key).toMatch(/\/clip\.mp4$/);
    expect((result as UploadedFile & { output(name: "poster"): UploadedFile }).output("poster")).toMatchObject({
      type: "image/jpeg"
    });
    expect(written[0]).toContain("__uplift/originals/");
    expect(written.some((key) => key.endsWith("/clip.mp4"))).toBe(true);
    expect(deleted).toEqual([written[0]]);
    expect(completed).toEqual(["clip"]);
    expect(listenerStatuses).toEqual(["clip:queued", "processing", "completed:image/jpeg"]);
    expect(app.routes.clip._def.listenerErrors).toHaveLength(1);
  });

  it("persists queued Transform Job status across app instances through the configured queue", async () => {
    const queue = createMemoryTransformQueue();
    const storage = memoryStorage();
    const web = uplift({
      storage,
      asyncTransforms: { queue, queueName: "uploads:async", keepOriginal: false },
      routes: {
        clip: video().transformAsync(async ({ body }) => new File([await body.text()], "clip.mp4", { type: "video/mp4" }))
      }
    });
    const worker = uplift({
      storage,
      asyncTransforms: { queue, queueName: "uploads:async", keepOriginal: false },
      routes: {
        clip: video().transformAsync(async ({ body }) => new File([await body.text()], "clip.mp4", { type: "video/mp4" }))
      }
    });
    const statusServer = uplift({
      storage,
      asyncTransforms: { queue, queueName: "uploads:async", keepOriginal: false },
      routes: {
        clip: video().transformAsync(async ({ body }) => body)
      }
    });

    const accepted = await handleUploadRequest(web, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const queued = await handleUploadRequest(statusServer, new Request(`https://app.test/upload?job=${result.id}`));
    const completed = await runNextTransformJob(worker);
    const terminal = await handleUploadRequest(statusServer, new Request(`https://app.test/upload?job=${result.id}`));

    expect(await queued.json()).toMatchObject({ id: result.id, status: "queued" });
    expect(completed).toMatchObject({ id: result.id, status: "completed" });
    expect(await terminal.json()).toMatchObject({ id: result.id, status: "completed", result: { type: "video/mp4" } });
  });

  it("claims queued Transform Jobs once across competing workers", async () => {
    const queue = createMemoryTransformQueue();
    const storage = memoryStorage();
    let runs = 0;
    const app = uplift({
      storage,
      asyncTransforms: { queue, keepOriginal: false },
      routes: {
        clip: video().transformAsync(async ({ body }) => {
          runs += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return new File([await body.text()], "clip.mp4", { type: "video/mp4" });
        })
      }
    });

    const accepted = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const [first, second] = await Promise.all([runNextTransformJob(app), runNextTransformJob(app)]);

    expect([first?.id, second?.id].filter(Boolean)).toEqual([result.id]);
    expect(runs).toBe(1);
  });

  it("cleans up the Original Upload when durable queue persistence fails", async () => {
    const deleted: string[] = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => ({ key, url: `memory://${key}`, name: file.name, type: file.type, size: file.size, provider: "memory" }),
        get: async () => undefined,
        delete: async (key) => {
          deleted.push(key);
        }
      },
      asyncTransforms: {
        keepOriginal: false,
        queue: {
          create: async () => {
            throw new Error("redis unavailable");
          },
          read: async () => undefined,
          claimNext: async () => undefined,
          claim: async () => undefined,
          releaseOriginalBody: async () => {
            throw new Error("unreachable");
          },
          complete: async () => {
            throw new Error("unreachable");
          },
          fail: async () => {
            throw new Error("unreachable");
          },
          shouldDeleteOriginal: () => false
        }
      },
      routes: {
        clip: video().transformAsync(async ({ body }) => body)
      }
    });

    const response = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=clip"));
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({ code: "STORAGE_FAILED", message: "redis unavailable" });
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toContain("__uplift/originals/");
  });

  it("inherits root async timeout and lets route timeout override it", async () => {
    const queue = createMemoryTransformQueue();
    const storage = memoryStorage();
    const app = uplift({
      storage,
      asyncTransforms: { queue, keepOriginal: true, timeout: "0.001s" },
      routes: {
        inherited: video().transformAsync(async ({ body }) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return body;
        }),
        overridden: video().transformAsync(async ({ body }) => body, { timeout: "1s" })
      }
    });

    const inherited = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=inherited"));
    const inheritedHandle = await inherited.json() as { result: { id: string } };
    const overridden = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=overridden"));
    const overriddenHandle = await overridden.json() as { result: { id: string } };

    await expect(runTransformJob(app, inheritedHandle.result.id)).resolves.toMatchObject({
      status: "failed",
      error: { code: "TRANSFORM_FAILED" }
    });
    await expect(runTransformJob(app, overriddenHandle.result.id)).resolves.toMatchObject({
      status: "completed",
      timeout: "1s"
    });
  });

  it("fails queued jobs when the worker upload contract has drifted", async () => {
    const queue = createMemoryTransformQueue();
    const storage = memoryStorage();
    const web = uplift({
      storage,
      asyncTransforms: { queue, keepOriginal: true },
      routes: {
        clip: video()
          .transformAsync(async ({ body }) => body)
          .outputs({ name: "poster" as const, produce: async ({ body }) => body })
      }
    });
    const worker = uplift({
      storage,
      asyncTransforms: { queue, keepOriginal: true },
      routes: {
        clip: video().transformAsync(async ({ body }) => body)
      }
    });

    const accepted = await handleUploadRequest(web, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const failed = await runTransformJob(worker, result.id);

    expect(failed).toMatchObject({
      status: "failed",
      error: { code: "VALIDATION_FAILED", message: "Transform Job route contract no longer matches the worker upload contract." }
    });
  });

  it("fails queued jobs when async transform semantics have changed", async () => {
    const queue = createMemoryTransformQueue();
    const storage = memoryStorage();
    const web = uplift({
      storage,
      asyncTransforms: { queue, keepOriginal: true },
      routes: {
        clip: video().transformAsync(async ({ body }) => new File([`${await body.text()} web`], "clip.mp4", { type: "video/mp4" }))
      }
    });
    const worker = uplift({
      storage,
      asyncTransforms: { queue, keepOriginal: true },
      routes: {
        clip: video().transformAsync(async ({ body }) => new File([`${await body.text()} worker`], "clip.mp4", { type: "video/mp4" }))
      }
    });

    const accepted = await handleUploadRequest(web, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const failed = await runTransformJob(worker, result.id);

    expect(failed).toMatchObject({
      status: "failed",
      error: { code: "VALIDATION_FAILED", message: "Transform Job route contract no longer matches the worker upload contract." }
    });
  });

  it("fails queued jobs when the async transform route has been removed", async () => {
    const queue = createMemoryTransformQueue();
    const storage = memoryStorage();
    const web = uplift({
      storage,
      asyncTransforms: { queue, keepOriginal: true },
      routes: {
        clip: video().transformAsync(async ({ body }) => body)
      }
    });
    const worker = uplift({
      storage,
      asyncTransforms: { queue, keepOriginal: true },
      routes: {
        other: video().transformAsync(async ({ body }) => body)
      }
    });

    const accepted = await handleUploadRequest(web, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const failed = await runTransformJob(worker, result.id);

    expect(failed).toMatchObject({
      status: "failed",
      error: { code: "UNKNOWN_ROUTE", message: "Unknown async transform route: clip" }
    });
  });

  it("rejects non-serializable async job metadata during upload acceptance", async () => {
    const app = uplift({
      storage: memoryStorage(),
      asyncTransforms: { queue: createMemoryTransformQueue(), keepOriginal: false },
      routes: {
        clip: video()
          .meta(() => ({ fn: () => undefined }))
          .transformAsync(async ({ body }) => body)
      }
    });

    const response = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=clip"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_FAILED",
        message: expect.stringContaining("Async transform metadata must be JSON-serializable")
      }
    });
    await expect(runNextTransformJob(app)).resolves.toBeUndefined();
  });

  it("fails malformed queued payloads with provider-neutral Upload Errors", async () => {
    const malformed = {
      id: "job_bad",
      route: "clip",
      status: "queued"
    };
    const queue = {
      create: async () => malformed as never,
      read: async () => malformed as never,
      claimNext: async () => malformed as never,
      claim: async () => malformed as never,
      releaseOriginalBody: async () => malformed as never,
      complete: async () => malformed as never,
      fail: async (id: string, error: unknown) => ({
        id,
        route: "clip",
        status: "failed" as const,
        original: { key: "missing", file: inputFile },
        metadata: undefined,
        user: undefined,
        keepOriginal: false as const,
        error: normalizeTransformJobError(error),
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      shouldDeleteOriginal: () => false
    };
    const app = uplift({
      storage: memoryStorage(),
      asyncTransforms: { queue, keepOriginal: false },
      routes: {
        clip: video().transformAsync(async ({ body }) => body)
      }
    });

    await expect(runNextTransformJob(app)).resolves.toMatchObject({
      status: "failed",
      error: { code: "VALIDATION_FAILED", message: "Malformed Transform Job payload." }
    });
  });

  it("runs queued jobs from stored Original Upload bytes after releasing request memory", async () => {
    const stored = new Map<string, File>();
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file, body }) => {
          stored.set(key, body);
          return {
            key,
            url: `memory://${key}`,
            name: file.name,
            type: file.type,
            size: file.size,
            provider: "memory"
          };
        },
        get: async (key) => stored.get(key)
      },
      asyncTransforms: { keepOriginal: true },
      routes: {
        clip: video().transformAsync(async ({ body }) => new File([`${await body.text()} durable`], "clip.mp4", { type: "video/mp4" }))
      }
    });

    const accepted = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const completed = await runTransformJob(app, result.id);
    const status = await handleUploadRequest(app, new Request(`https://app.test/upload?job=${result.id}`));

    expect(completed).toMatchObject({ status: "completed", result: { primary: { type: "video/mp4" } } });
    expect(completed.original.body).toBeUndefined();
    expect(await status.json()).toMatchObject({ id: result.id, status: "completed", result: { type: "video/mp4" } });
  });

  it("drops Original Upload file bodies from failed terminal jobs", () => {
    const store = createTransformJobStore({ idFactory: () => "job_1" });
    const job = store.create({
      route: "clip",
      original: { file: inputFile, body: new File(["raw"], "clip.mp4", { type: "video/mp4" }) },
      keepOriginal: true
    });

    const failed = store.fail(job.id, new UploadError("TRANSFORM_FAILED", "failed"));
    const reread = store.read(job.id);

    expect(failed).toMatchObject({ status: "failed", error: { code: "TRANSFORM_FAILED" } });
    expect(failed.original.body).toBeUndefined();
    expect(reread?.original.body).toBeUndefined();
    expect(reread?.original.file).toEqual(inputFile);
  });

  it("does not let timed-out transform work publish late results", async () => {
    const written: string[] = [];
    const completed: string[] = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => {
          written.push(key);
          return {
            key,
            url: `memory://${key}`,
            name: file.name,
            type: file.type,
            size: file.size,
            provider: "memory"
          };
        }
      },
      asyncTransforms: { keepOriginal: true },
      onUploadComplete: async ({ route }) => {
        completed.push(route);
      },
      routes: {
        clip: video()
          .transformAsync(async ({ body }) => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return new File([await body.text()], "clip.mp4", { type: "video/mp4" });
          }, { timeout: "0.001s" })
          .done(() => {
            completed.push("done");
          })
      }
    });

    const accepted = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const failed = await runTransformJob(app, result.id);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const reread = await handleUploadRequest(app, new Request(`https://app.test/upload?job=${result.id}`));

    expect(failed).toMatchObject({
      status: "failed",
      error: { code: "TRANSFORM_FAILED" }
    });
    expect(await reread.json()).toMatchObject({
      status: "failed",
      error: { code: "TRANSFORM_FAILED" }
    });
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("__uplift/originals/");
    expect(completed).toEqual([]);
  });

  it("does not leave runnable jobs when Original Upload storage fails", async () => {
    const queued: string[] = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async () => {
          throw new Error("disk full");
        }
      },
      asyncTransforms: { keepOriginal: false },
      routes: {
        clip: video()
          .transformAsync(async ({ body }) => body)
          .listeners({
            queued: ({ id }) => {
              queued.push(id);
            }
          })
      }
    });

    const response = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=clip"));
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({ code: "STORAGE_FAILED" });
    expect(queued).toEqual([]);
    await expect(runNextTransformJob(app)).resolves.toBeUndefined();
  });

  it("keeps failed Original Uploads by default", async () => {
    const deleted: string[] = [];
    const app = uplift({
      storage: {
        ...memoryStorage(),
        delete: async (key) => {
          deleted.push(key);
        }
      },
      asyncTransforms: {},
      routes: {
        clip: video().transformAsync(async () => {
          throw new Error("encode failed");
        })
      }
    });

    const accepted = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const failed = await runTransformJob(app, result.id);

    expect(failed).toMatchObject({ status: "failed" });
    expect(deleted).toEqual([]);
  });

  it("rejects unsupported async multi-file and mixed transform routes before creating jobs", async () => {
    const writes: string[] = [];
    const multiApp = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => {
          writes.push(key);
          return { key, url: `memory://${key}`, name: file.name, type: file.type, size: file.size, provider: "memory" };
        }
      },
      asyncTransforms: { keepOriginal: false },
      routes: {
        clips: video().multiple(2).transformAsync(async ({ body }) => body),
        mixed: video()
          .transform(async ({ body }) => body)
          .transformAsync(async ({ body }) => body)
      }
    });

    const multi = await handleUploadRequest(multiApp, multiUploadRequest("https://app.test/upload?route=clips"));
    const mixed = await handleUploadRequest(multiApp, uploadRequest("https://app.test/upload?route=mixed"));

    await expect(multi.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED", message: "Async transform routes currently accept exactly one file." }
    });
    await expect(mixed.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED", message: "Routes cannot combine .transform(...) and .transformAsync(...)." }
    });
    expect(writes).toEqual([]);
    await expect(runNextTransformJob(multiApp)).resolves.toBeUndefined();
  });

  it("accepts empty async transform options without treating them as transforms", async () => {
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => ({ key, url: `memory://${key}`, name: file.name, type: file.type, size: file.size, provider: "memory" })
      },
      asyncTransforms: { keepOriginal: false },
      routes: {
        clip: video().transformAsync(async ({ body }) => body, {})
      }
    });

    const accepted = await handleUploadRequest(app, uploadRequest("https://app.test/upload?route=clip"));
    const { result } = await accepted.json() as { result: { id: string } };
    const completed = await runTransformJob(app, result.id);

    expect(completed).toMatchObject({ status: "completed" });
  });

  it("rejects invalid async transform objects at builder time", () => {
    expect(() => {
      (video().transformAsync as (...values: unknown[]) => unknown)({ resize: true });
    }).toThrow(".transformAsync(...) expects transform functions or transform objects");
  });
});

function uploadRequest(url: string) {
  const form = new FormData();
  form.append("file", new File(["raw"], "clip.mp4", { type: "video/mp4" }));
  return new Request(url, { method: "POST", body: form });
}

function multiUploadRequest(url: string) {
  const form = new FormData();
  form.append("files", new File(["one"], "one.mp4", { type: "video/mp4" }));
  form.append("files", new File(["two"], "two.mp4", { type: "video/mp4" }));
  return new Request(url, { method: "POST", body: form });
}

function memoryStorage() {
  const objects = new Map<string, File>();
  return {
    provider: "memory",
    put: async ({ key, file, body }: { key: string; file: typeof inputFile; body: File }) => {
      objects.set(key, body);
      return { key, url: `memory://${key}`, name: file.name, type: file.type, size: file.size, provider: "memory" };
    },
    get: async (key: string) => objects.get(key),
    delete: async (key: string) => {
      objects.delete(key);
    }
  };
}
