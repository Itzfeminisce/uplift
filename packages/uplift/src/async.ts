import {
  UploadError,
  type AsyncTransformKeepOriginal,
  type AsyncTransformQueue,
  type DurationValue,
  type UploadedFile,
  type UploadInputFile
} from "./types";

export type TransformJobStatus = "queued" | "processing" | "completed" | "failed";

export type OriginalUploadReference = {
  key: string;
  file: UploadInputFile;
  body?: File;
};

export type TransformJobProgress = {
  value?: number;
  message?: string;
};

export type TransformJobResult = {
  primary: UploadedFile;
};

export type TransformJobError = {
  code: UploadError["code"];
  message: string;
};

export type TransformJob = {
  id: string;
  route: string;
  status: TransformJobStatus;
  claimToken?: string;
  progress?: TransformJobProgress;
  timeout?: DurationValue;
  original: OriginalUploadReference;
  metadata: unknown;
  user: unknown;
  keepOriginal: AsyncTransformKeepOriginal;
  routeContract?: string;
  error?: TransformJobError;
  result?: TransformJobResult;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTransformJobInput = {
  route: string;
  original: {
    file: UploadInputFile;
    body?: File;
    key?: string;
  };
  metadata?: unknown;
  user?: unknown;
  timeout?: DurationValue;
  keepOriginal: AsyncTransformKeepOriginal;
  routeContract?: string;
};

export type TransformJobStore = {
  create(input: CreateTransformJobInput): TransformJob;
  read(id: string): TransformJob | undefined;
  listQueued(): TransformJob[];
  markProcessing(id: string, progress?: TransformJobProgress): TransformJob;
  updateProgress(id: string, progress: TransformJobProgress): TransformJob;
  releaseOriginalBody(id: string): TransformJob;
  complete(id: string, result: TransformJobResult, claimToken?: string): TransformJob;
  fail(id: string, error: unknown, claimToken?: string): TransformJob;
  shouldDeleteOriginal(job: TransformJob): boolean;
};

export type TransformJobStoreOptions = {
  idFactory?: () => string;
  originalKeyFactory?: (jobId: string, file: UploadInputFile) => string;
};

export function createTransformJobStore(options: TransformJobStoreOptions = {}): TransformJobStore {
  const jobs = new Map<string, TransformJob>();
  const originalKeys = new Set<string>();
  const idFactory = options.idFactory ?? (() => collisionResistantId("job"));
  const originalKeyFactory = options.originalKeyFactory ?? ((jobId, file) => {
    const extension = file.extension ? `.${file.extension}` : "";
    return `__uplift/originals/${jobId}/${safeOriginalName(file.name)}${extension}`;
  });

  return {
    create(input) {
      const id = uniqueJobId(jobs, idFactory);
      const originalKey = input.original.key ?? uniqueOriginalKey(originalKeys, () => originalKeyFactory(id, input.original.file));
      if (originalKeys.has(originalKey)) {
        throw new UploadError("UNSAFE_STORAGE_KEY", "Original Upload key collision detected.");
      }
      originalKeys.add(originalKey);
      const now = new Date();
      const job: TransformJob = {
        id,
        route: input.route,
        status: "queued",
        original: {
          key: originalKey,
          file: { ...input.original.file },
          ...(input.original.body ? { body: input.original.body } : {})
        },
        metadata: input.metadata,
        user: input.user,
        keepOriginal: input.keepOriginal,
        ...(input.routeContract ? { routeContract: input.routeContract } : {}),
        ...(input.timeout ? { timeout: input.timeout } : {}),
        createdAt: now,
        updatedAt: now
      };
      jobs.set(id, job);
      return cloneJob(job);
    },
    read(id) {
      const job = jobs.get(id);
      return job ? cloneJob(job) : undefined;
    },
    listQueued() {
      return [...jobs.values()].filter((job) => job.status === "queued").map(cloneJob);
    },
    markProcessing(id, progress) {
      const job = requireJob(jobs, id);
      if (isTerminal(job.status)) return cloneJob(job);
      job.status = "processing";
      if (progress) job.progress = progress;
      job.updatedAt = new Date();
      return cloneJob(job);
    },
    updateProgress(id, progress) {
      const job = requireJob(jobs, id);
      if (isTerminal(job.status)) return cloneJob(job);
      job.status = "processing";
      job.progress = progress;
      job.updatedAt = new Date();
      return cloneJob(job);
    },
    releaseOriginalBody(id) {
      const job = requireJob(jobs, id);
      delete job.original.body;
      job.updatedAt = new Date();
      return cloneJob(job);
    },
    complete(id, result) {
      const job = requireJob(jobs, id);
      if (isTerminal(job.status)) return cloneJob(job);
      assertTransformJobKeysDoNotCollide(job.original.key, result.primary.key);
      job.status = "completed";
      job.result = result;
      delete job.error;
      delete job.original.body;
      job.updatedAt = new Date();
      return cloneJob(job);
    },
    fail(id, error) {
      const job = requireJob(jobs, id);
      if (isTerminal(job.status)) return cloneJob(job);
      job.status = "failed";
      job.error = normalizeTransformJobError(error);
      delete job.original.body;
      job.updatedAt = new Date();
      return cloneJob(job);
    },
    shouldDeleteOriginal(job) {
      if (job.status === "completed") return job.keepOriginal === false || job.keepOriginal === "failed";
      if (job.status === "failed") return job.keepOriginal === false;
      return false;
    }
  };
}

export function createMemoryTransformQueue(options: TransformJobStoreOptions & { name?: string } = {}): AsyncTransformQueue {
  const store = createTransformJobStore(options);
  const claimed = new Set<string>();
  return {
    ...(options.name ? { name: options.name } : {}),
    create(input) {
      return store.create(input);
    },
    read(id) {
      return store.read(id);
    },
    claimNext() {
      const job = store.listQueued().find((candidate) => !claimed.has(candidate.id));
      if (!job) return undefined;
      claimed.add(job.id);
      return store.markProcessing(job.id);
    },
    claim(id) {
      const job = store.read(id);
      if (!job || job.status !== "queued" || claimed.has(id)) return undefined;
      claimed.add(id);
      return store.markProcessing(id);
    },
    releaseOriginalBody(id) {
      return store.releaseOriginalBody(id);
    },
    complete(id, result) {
      const job = store.complete(id, result);
      claimed.delete(id);
      return job;
    },
    fail(id, error) {
      const job = store.fail(id, error);
      claimed.delete(id);
      return job;
    },
    shouldDeleteOriginal(job) {
      return store.shouldDeleteOriginal(job);
    }
  };
}

export function normalizeTransformJobError(error: unknown): TransformJobError {
  if (error instanceof UploadError) return { code: error.code, message: error.message };
  if (isUploadErrorLike(error)) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: "UNKNOWN", message: error.message };
  return { code: "UNKNOWN", message: "Unknown transform job failure." };
}

export function assertTransformJobKeysDoNotCollide(originalKey: string, finalPrimaryKey: string): void {
  if (originalKey === finalPrimaryKey) {
    throw new UploadError("UNSAFE_STORAGE_KEY", "Final primary key must not collide with the Original Upload key.");
  }
}

function uniqueJobId(jobs: Map<string, TransformJob>, idFactory: () => string): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = idFactory();
    if (!jobs.has(id)) return id;
  }
  throw new UploadError("UNKNOWN", "Unable to allocate a unique Transform Job id.");
}

function uniqueOriginalKey(originalKeys: Set<string>, keyFactory: () => string): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const key = keyFactory();
    if (!originalKeys.has(key)) return key;
  }
  throw new UploadError("UNSAFE_STORAGE_KEY", "Unable to allocate a unique Original Upload key.");
}

function requireJob(jobs: Map<string, TransformJob>, id: string): TransformJob {
  const job = jobs.get(id);
  if (!job) throw new UploadError("UNKNOWN_ROUTE", `Unknown Transform Job: ${id}`);
  return job;
}

function isTerminal(status: TransformJobStatus): boolean {
  return status === "completed" || status === "failed";
}

function cloneJob(job: TransformJob): TransformJob {
  return {
    ...job,
    original: {
      ...job.original,
      file: { ...job.original.file },
      ...(job.original.body ? { body: job.original.body } : {})
    },
    ...(job.progress ? { progress: { ...job.progress } } : {}),
    ...(job.error ? { error: { ...job.error } } : {}),
    ...(job.result ? { result: { primary: { ...job.result.primary } } } : {})
  };
}

function collisionResistantId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function safeOriginalName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "upload";
}

function isUploadErrorLike(error: unknown): error is TransformJobError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}
