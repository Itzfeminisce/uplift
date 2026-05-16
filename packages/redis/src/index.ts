import {
  UploadError,
  type AsyncTransformKeepOriginal,
  type AsyncTransformQueue,
  type AsyncTransformsConfig,
  type DurationValue,
  type UploadInputFile
} from "@uplift-io/uplift";
import {
  assertTransformJobKeysDoNotCollide,
  normalizeTransformJobError,
  type TransformJob
} from "@uplift-io/uplift/server";

export type RedisLike = {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown> | unknown;
  del(key: string): Promise<unknown> | unknown;
  lpush(key: string, value: string): Promise<unknown> | unknown;
  rpop(key: string): Promise<string | null> | string | null;
  zadd(key: string, score: number, member: string): Promise<unknown> | unknown;
  zrangebyscore(key: string, min: number | string, max: number | string, ...args: unknown[]): Promise<string[]> | string[];
  zrem(key: string, member: string): Promise<unknown> | unknown;
};

export type RedisAsyncTransformsOptions = {
  queueName: string;
  timeout?: DurationValue;
  keepOriginal?: AsyncTransformKeepOriginal;
  claimVisibilityTimeoutMs?: number;
};

const DEFAULT_CLAIM_VISIBILITY_TIMEOUT_MS = 5 * 60 * 1000;
const SERIALIZED_JOB_SCHEMA_VERSION = 1;

export function asyncTransforms(redis: RedisLike, options: RedisAsyncTransformsOptions): AsyncTransformsConfig {
  assertQueueName(options.queueName);
  const queueOptions = options.claimVisibilityTimeoutMs === undefined
    ? {}
    : { claimVisibilityTimeoutMs: options.claimVisibilityTimeoutMs };
  return {
    queue: createRedisTransformQueue(redis, options.queueName, queueOptions),
    queueName: options.queueName,
    ...(options.timeout ? { timeout: options.timeout } : {}),
    keepOriginal: options.keepOriginal ?? "failed"
  };
}

function createRedisTransformQueue(redis: RedisLike, queueName: string, options: Pick<RedisAsyncTransformsOptions, "claimVisibilityTimeoutMs"> = {}): AsyncTransformQueue {
  const keys = redisKeys(queueName);
  const claimVisibilityTimeoutMs = options.claimVisibilityTimeoutMs ?? DEFAULT_CLAIM_VISIBILITY_TIMEOUT_MS;
  return {
    name: queueName,
    async create(input) {
      if (input.original.body) {
        throw new UploadError("STORAGE_FAILED", "Redis-backed async transforms require storage.get() so workers can read Original Upload bytes.");
      }
      const id = collisionResistantId("job");
      const now = new Date();
      const originalKey = input.original.key ?? originalUploadKey(id, input.original.file);
      const job: TransformJob = {
        id,
        route: input.route,
        status: "queued",
        original: {
          key: originalKey,
          file: { ...input.original.file }
        },
        metadata: input.metadata,
        user: input.user,
        keepOriginal: input.keepOriginal,
        ...(input.routeContract ? { routeContract: input.routeContract } : {}),
        ...(input.timeout ? { timeout: input.timeout } : {}),
        createdAt: now,
        updatedAt: now
      };
      await writeJob(redis, keys.job(id), job);
      try {
        await redis.lpush(keys.queued, id);
      } catch (error) {
        await writeFailedJob(redis, keys.job(id), job, error);
        throw error;
      }
      return cloneJob(job);
    },
    async read(id) {
      return readJob(redis, keys.job(id), id);
    },
    async claimNext() {
      while (true) {
        const staleId = await nextStaleProcessingJobId(redis, keys);
        if (staleId) {
          const recovered = await claimJob(redis, keys, staleId, claimVisibilityTimeoutMs);
          if (recovered) return recovered;
          continue;
        }
        const id = await redis.rpop(keys.queued);
        if (!id) return undefined;
        const claimed = await claimJob(redis, keys, id, claimVisibilityTimeoutMs);
        if (claimed) return claimed;
      }
    },
    async claim(id) {
      return claimJob(redis, keys, id, claimVisibilityTimeoutMs);
    },
    async isClaimActive(id, claimToken) {
      const job = await readJob(redis, keys.job(id), id);
      if (!job || isTerminal(job.status)) return false;
      return ownsActiveClaim(redis, keys, id, claimToken);
    },
    async releaseOriginalBody(id) {
      const job = await requireJob(redis, keys.job(id), id);
      const updated = {
        ...job,
        original: {
          key: job.original.key,
          file: { ...job.original.file }
        },
        updatedAt: new Date()
      };
      await writeJob(redis, keys.job(id), updated);
      return cloneJob(updated);
    },
    async complete(id, result, claimToken) {
      const job = await requireJob(redis, keys.job(id), id);
      if (isTerminal(job.status)) return cloneJob(job);
      if (!(await ownsActiveClaim(redis, keys, id, claimToken))) return cloneJob(job);
      assertTransformJobKeysDoNotCollide(job.original.key, result.primary.key);
      const updated: TransformJob = {
        ...job,
        status: "completed",
        result,
        original: {
          key: job.original.key,
          file: { ...job.original.file }
        },
        updatedAt: new Date()
      };
      delete updated.error;
      await writeJob(redis, keys.job(id), updated);
      await releaseOwnedClaim(redis, keys, id, claimToken);
      return cloneJob(updated);
    },
    async fail(id, error, claimToken) {
      const job = await readJob(redis, keys.job(id), id);
      const base = job ?? failedPlaceholder(id);
      if (isTerminal(base.status)) return cloneJob(base);
      if (!(await ownsActiveClaim(redis, keys, id, claimToken))) return cloneJob(base);
      const updated: TransformJob = {
        ...base,
        status: "failed",
        error: normalizeTransformJobError(error),
        original: {
          key: base.original.key,
          file: { ...base.original.file }
        },
        updatedAt: new Date()
      };
      delete updated.result;
      await writeJob(redis, keys.job(id), updated);
      await releaseOwnedClaim(redis, keys, id, claimToken);
      return cloneJob(updated);
    },
    shouldDeleteOriginal(job) {
      if (job.status === "completed") return job.keepOriginal === false || job.keepOriginal === "failed";
      if (job.status === "failed") return job.keepOriginal === false;
      return false;
    }
  };
}

async function claimJob(redis: RedisLike, keys: ReturnType<typeof redisKeys>, id: string, leaseMs: number): Promise<TransformJob | undefined> {
  const token = collisionResistantId("claim");
  const lock = await redis.set(keys.claim(id), token, "NX", "PX", leaseMs);
  if (!lock) return undefined;
  const key = keys.job(id);
  const job = await readJob(redis, key, id);
  if (!job) {
    await releaseClaim(redis, keys, id);
    return undefined;
  }
  if (job.status !== "queued" && !(job.status === "processing" && isStaleProcessingJob(job, leaseMs))) {
    await releaseClaim(redis, keys, id);
    return undefined;
  }
  const updated: TransformJob = {
    ...job,
    status: "processing",
    updatedAt: new Date()
  };
  await writeJob(redis, key, updated);
  await redis.zadd(keys.processing, Date.now() + leaseMs, id);
  return cloneJob({ ...updated, claimToken: token });
}

async function requireJob(redis: RedisLike, key: string, id: string): Promise<TransformJob> {
  const job = await readJob(redis, key, id);
  if (!job) throw new UploadError("UNKNOWN_ROUTE", `Unknown Transform Job: ${id}`);
  return job;
}

async function readJob(redis: RedisLike, key: string, id?: string): Promise<TransformJob | undefined> {
  const raw = await redis.get(key);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return deserializeJob(assertSerializedJob(parsed));
  } catch (error) {
    if (id) {
      const failed = failedPlaceholder(id, new UploadError("VALIDATION_FAILED", "Malformed Redis Transform Job payload."));
      await writeJob(redis, key, failed);
      return cloneJob(failed);
    }
    return undefined;
  }
}

async function writeJob(redis: RedisLike, key: string, job: TransformJob): Promise<void> {
  await redis.set(key, JSON.stringify(serializeJob(job)));
}

function serializeJob(job: TransformJob): SerializedTransformJob {
  return {
    schemaVersion: SERIALIZED_JOB_SCHEMA_VERSION,
    ...job,
    original: {
      key: job.original.key,
      file: { ...job.original.file }
    },
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

function deserializeJob(job: SerializedTransformJob): TransformJob {
  const { schemaVersion: _schemaVersion, ...rest } = job;
  return {
    ...rest,
    createdAt: new Date(job.createdAt),
    updatedAt: new Date(job.updatedAt)
  };
}

function cloneJob(job: TransformJob): TransformJob {
  const outputs = job.result?.primary.outputs
    ? Object.fromEntries(Object.entries(job.result.primary.outputs).map(([name, output]) => [name, { ...output }]))
    : undefined;
  return {
    ...job,
    original: {
      key: job.original.key,
      file: { ...job.original.file }
    },
    ...(job.progress ? { progress: { ...job.progress } } : {}),
    ...(job.error ? { error: { ...job.error } } : {}),
    ...(job.result ? { result: { primary: { ...job.result.primary, ...(outputs ? { outputs } : {}) } } } : {})
  };
}

async function writeFailedJob(redis: RedisLike, key: string, job: TransformJob, error: unknown): Promise<void> {
  await writeJob(redis, key, {
    ...job,
    status: "failed",
    error: normalizeTransformJobError(error),
    original: {
      key: job.original.key,
      file: { ...job.original.file }
    },
    updatedAt: new Date()
  });
}

function failedPlaceholder(id: string, error: unknown = new UploadError("UNKNOWN", "Transform Job failed before it could be read.")): TransformJob {
  const now = new Date();
  return {
    id,
    route: "unknown",
    status: "failed",
    original: {
      key: "unknown",
      file: {
        name: "unknown",
        type: "application/octet-stream",
        size: 0
      }
    },
    metadata: undefined,
    user: undefined,
    keepOriginal: false,
    error: normalizeTransformJobError(error),
    createdAt: now,
    updatedAt: now
  };
}

function redisKeys(queueName: string) {
  const prefix = `uplift:${queueName}`;
  return {
    queued: `${prefix}:queued`,
    processing: `${prefix}:processing`,
    job: (id: string) => `${prefix}:jobs:${id}`,
    claim: (id: string) => `${prefix}:claims:${id}`
  };
}

function assertQueueName(queueName: string): void {
  if (!queueName.trim()) {
    throw new UploadError("VALIDATION_FAILED", "Redis async transforms require a non-empty queueName.");
  }
}

function originalUploadKey(jobId: string, file: UploadInputFile): string {
  const extension = file.extension ? `.${file.extension}` : "";
  return `__uplift/originals/${jobId}/${safeOriginalName(file.name)}${extension}`;
}

function safeOriginalName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "upload";
}

function collisionResistantId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function isTerminal(status: TransformJob["status"]): boolean {
  return status === "completed" || status === "failed";
}

type SerializedTransformJob = Omit<TransformJob, "createdAt" | "updatedAt"> & {
  schemaVersion: typeof SERIALIZED_JOB_SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
};

async function nextStaleProcessingJobId(redis: RedisLike, keys: ReturnType<typeof redisKeys>): Promise<string | undefined> {
  const [id] = await redis.zrangebyscore(keys.processing, "-inf", Date.now(), "LIMIT", 0, 1);
  if (!id) return undefined;
  await redis.zrem(keys.processing, id);
  await redis.del(keys.claim(id));
  return id;
}

async function releaseClaim(redis: RedisLike, keys: ReturnType<typeof redisKeys>, id: string): Promise<void> {
  await redis.zrem(keys.processing, id);
  await redis.del(keys.claim(id));
}

async function releaseOwnedClaim(redis: RedisLike, keys: ReturnType<typeof redisKeys>, id: string, claimToken: string | undefined): Promise<void> {
  const current = await redis.get(keys.claim(id));
  if (claimToken && current && current !== claimToken) return;
  await redis.zrem(keys.processing, id);
  await redis.del(keys.claim(id));
}

async function ownsActiveClaim(redis: RedisLike, keys: ReturnType<typeof redisKeys>, id: string, claimToken: string | undefined): Promise<boolean> {
  if (!claimToken) return false;
  const current = await redis.get(keys.claim(id));
  return current === claimToken;
}

function isStaleProcessingJob(job: TransformJob, leaseMs: number): boolean {
  return Date.now() - job.updatedAt.getTime() >= leaseMs;
}

function assertSerializedJob(value: unknown): SerializedTransformJob {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { schemaVersion?: unknown }).schemaVersion !== SERIALIZED_JOB_SCHEMA_VERSION ||
    typeof (value as { id?: unknown }).id !== "string" ||
    typeof (value as { route?: unknown }).route !== "string" ||
    !isJobStatus((value as { status?: unknown }).status) ||
    typeof (value as { original?: { key?: unknown } }).original?.key !== "string" ||
    typeof (value as { original?: { file?: { name?: unknown } } }).original?.file?.name !== "string" ||
    typeof (value as { original?: { file?: { type?: unknown } } }).original?.file?.type !== "string" ||
    typeof (value as { original?: { file?: { size?: unknown } } }).original?.file?.size !== "number" ||
    typeof (value as { createdAt?: unknown }).createdAt !== "string" ||
    typeof (value as { updatedAt?: unknown }).updatedAt !== "string" ||
    Number.isNaN(new Date((value as { createdAt: string }).createdAt).valueOf()) ||
    Number.isNaN(new Date((value as { updatedAt: string }).updatedAt).valueOf())
  ) {
    throw new UploadError("VALIDATION_FAILED", "Malformed Redis Transform Job payload.");
  }
  return value as SerializedTransformJob;
}

function isJobStatus(value: unknown): value is TransformJob["status"] {
  return value === "queued" || value === "processing" || value === "completed" || value === "failed";
}
