import {
  UploadError,
  type AsyncTransformsConfig,
  type PreparedUploadFile,
  type RouteManifest,
  type StorageHeaders,
  type UpliftApp,
  type UploadedFile,
  type UploadInputFile,
  type AsyncTransformQueue
} from "./types";
import { createMemoryTransformQueue, createTransformJobStore, normalizeTransformJobError, type TransformJob, type TransformJobStore } from "./async";
import { defaultKey, extensionForType, readJsonFile, toInputFile } from "./utils";

export {
  assertTransformJobKeysDoNotCollide,
  createMemoryTransformQueue,
  createTransformJobStore,
  normalizeTransformJobError,
  type CreateTransformJobInput,
  type OriginalUploadReference,
  type TransformJob,
  type TransformJobError,
  type TransformJobProgress,
  type TransformJobResult,
  type TransformJobStatus,
  type TransformJobStore
} from "./async";

type FileWithInput = {
  input: UploadInputFile;
  body: File;
};

type StoredFile = {
  file: UploadedFile;
  meta: unknown;
};

type AsyncTransformHandlePayload = {
  id: string;
  route: string;
  status: TransformJob["status"];
};

const asyncQueues = new WeakMap<UpliftApp, AsyncTransformQueue>();

export async function handleUploadRequest(app: UpliftApp, req: Request): Promise<Response> {
  const writtenKeys: string[] = [];
  try {
    if (req.method === "HEAD") {
      return new Response(null, { status: 204 });
    }
    if (req.method === "GET") {
      const jobId = new URL(req.url).searchParams.get("job");
      if (jobId) return json(await readTransformJobStatus(app, jobId), 200);
      return json(createRouteManifest(app), 200);
    }
    if (req.method !== "POST") {
      return json({ error: new UploadError("METHOD_NOT_ALLOWED", "Only HEAD, GET, and POST upload requests are supported.") }, 405);
    }

    const routeName = routeNameFromRequest(req);
    const route = app.routes[routeName];
    if (!route) throw new UploadError("UNKNOWN_ROUTE", `Unknown upload route: ${routeName}`);
    if (new URL(req.url).searchParams.get("preflight") === "1") {
      return json(await handlePreflight(app, req, route._def), 200);
    }

    const user = await resolveUser(app, route._def, req);
    const files = await filesFromRequest(req);
    if (files.length === 0) throw new UploadError("VALIDATION_FAILED", "No files were uploaded.");
    if (!route._def.multiple && files.length !== 1) {
      throw new UploadError("VALIDATION_FAILED", "This route accepts exactly one file.");
    }
    if (route._def.multipleLimit !== undefined && files.length > route._def.multipleLimit) {
      throw new UploadError("TOO_MANY_FILES", `This route accepts at most ${route._def.multipleLimit} files.`);
    }

    if (route._def.asyncTransforms) {
      validateAsyncTransformRoute(route._def);
      const result = await acceptAsyncTransformUpload(app, req, routeName, route._def, files, user);
      return json({ result }, 200);
    }

    const stored: StoredFile[] = [];
    for (const item of files) {
      const meta = await deriveMeta(route._def, req, item.input, user);
      await validateFile(route._def, req, item, user, meta);
      const prepared = await applyTransforms(route._def, item);
      const key = route._def.key
        ? await route._def.key({ req, file: prepared.file, user, meta })
        : defaultKey(prepared.file);
      assertSafeStorageKey(key);
      const headers = await resolveStorageHeaders(route._def, req, prepared.file, user, meta);
      const primary = await app.storage.put({
        key,
        file: prepared.file,
        body: prepared.body,
        ...(headers ? { headers } : {})
      });
      writtenKeys.push(primary.key);
      const outputs = await writeOutputs(app, route._def, key, prepared, primary, headers, writtenKeys);
      const file = Object.keys(outputs).length > 0 ? { ...primary, outputs } : primary;
      stored.push({
        file,
        meta
      });
    }

    const uploaded = stored.map((item) => item.file);
    const metas = stored.map((item) => item.meta);
    const firstUpload = uploaded[0];
    if (!firstUpload) throw new UploadError("UPLOAD_FAILED", "Upload did not produce a result.");
    const result: UploadedFile | UploadedFile[] = route._def.multiple ? uploaded : firstUpload;

    if (route._def.done) {
      if (route._def.multiple) {
        await route._def.done({ req, files: uploaded, user, meta: metas });
      } else {
        await route._def.done({ req, file: firstUpload, user, meta: metas[0] });
      }
    }

    if (app.onUploadComplete) await app.onUploadComplete({ route: routeName, result, user });
    return json({ result }, 200);
  } catch (error) {
    await rollbackWrittenFiles(app, writtenKeys);
    const uploadError = normalizeError(error);
    return json({ error: uploadError }, statusFor(uploadError));
  }
}

function validateAsyncTransformRoute(route: UpliftApp["routes"][string]["_def"]): void {
  if (route.multiple) {
    throw new UploadError("VALIDATION_FAILED", "Async transform routes currently accept exactly one file.");
  }
  if (route.transforms && route.transforms.length > 0) {
    throw new UploadError("VALIDATION_FAILED", "Routes cannot combine .transform(...) and .transformAsync(...).");
  }
}

export async function runNextTransformJob(app: UpliftApp): Promise<TransformJob | undefined> {
  const job = await getTransformJobQueue(app).claimNext();
  if (!job) return undefined;
  return runClaimedTransformJob(app, job);
}

export async function runTransformJob(app: UpliftApp, jobId: string): Promise<TransformJob> {
  const queue = getTransformJobQueue(app);
  const existing = await queue.read(jobId);
  if (existing?.status === "completed" || existing?.status === "failed") return existing;
  const claimed = await queue.claim(jobId);
  if (!claimed) {
    const current = await queue.read(jobId);
    if (current) return current;
    throw new UploadError("UNKNOWN_ROUTE", `Unknown Transform Job: ${jobId}`);
  }
  return runClaimedTransformJob(app, claimed);
}

async function runClaimedTransformJob(app: UpliftApp, claimedJob: TransformJob): Promise<TransformJob> {
  const queue = getTransformJobQueue(app);
  let job = claimedJob;
  if (!isTransformJobPayload(job)) {
    const id = typeof (job as { id?: unknown }).id === "string" ? (job as { id: string }).id : "unknown";
    const claimToken = typeof (job as { claimToken?: unknown }).claimToken === "string" ? (job as { claimToken: string }).claimToken : undefined;
    return queue.fail(id, new UploadError("VALIDATION_FAILED", "Malformed Transform Job payload."), claimToken);
  }
  const route = app.routes[job.route];
  if (!route) return queue.fail(job.id, new UploadError("UNKNOWN_ROUTE", `Unknown async transform route: ${job.route}`), job.claimToken);
  if (job.routeContract && job.routeContract !== routeContractSignature(route._def)) {
    return queue.fail(job.id, new UploadError("VALIDATION_FAILED", "Transform Job route contract no longer matches the worker upload contract."), job.claimToken);
  }
  await invokeAsyncListener(route._def, "processing", {
    id: job.id,
    route: job.route,
    status: "processing",
    ...(job.progress ? { progress: job.progress } : {})
  });
  const writtenKeys: string[] = [];
  const assertActive = () => assertTransformJobActive(queue, job.id, job.claimToken);
  let completedFile: UploadedFile | undefined;
  try {
    const originalBody = await readOriginalUploadBody(app, job);
    const file = await withTransformJobTimeout(job, async () => {
      const asyncRoute = {
        ...route._def,
        transforms: route._def.asyncTransforms ?? []
      };
      const prepared = await applyTransforms(asyncRoute, {
        input: job.original.file,
        body: originalBody
      });
      await assertActive();
      const key = route._def.key
        ? await route._def.key({ req: workerRequest(job), file: prepared.file, user: job.user, meta: job.metadata })
        : defaultKey(prepared.file);
      await assertActive();
      assertSafeStorageKey(key);
      const headers = await resolveStorageHeaders(route._def, workerRequest(job), prepared.file, job.user, job.metadata);
      await assertActive();
      const primary = await app.storage.put({
        key,
        file: prepared.file,
        body: prepared.body,
        ...(headers ? { headers } : {})
      });
      writtenKeys.push(primary.key);
      await assertActive();
      const outputs = await writeOutputs(app, route._def, key, prepared, primary, headers, writtenKeys, assertActive);
      const completedFile = Object.keys(outputs).length > 0 ? { ...primary, outputs } : primary;
      return completedFile;
    });
    await assertActive();
    job = await queue.complete(job.id, { primary: file }, job.claimToken);
    if (job.status !== "completed") {
      await rollbackWrittenFiles(app, writtenKeys);
      return job;
    }
    await cleanupOriginalUpload(app, queue, job);
    completedFile = file;
  } catch (error) {
    await rollbackWrittenFiles(app, writtenKeys);
    job = await queue.fail(job.id, error, job.claimToken);
    if (job.status !== "failed") return job;
    await invokeAsyncListener(route._def, "failed", {
      id: job.id,
      route: job.route,
      status: "failed",
      error: job.error ?? normalizeTransformJobError(error)
    });
    await cleanupOriginalUpload(app, queue, job);
    return job;
  }
  if (route._def.done) {
    await route._def.done({ req: workerRequest(job), file: completedFile, user: job.user, meta: job.metadata });
  }
  if (app.onUploadComplete) await app.onUploadComplete({ route: job.route, result: completedFile, user: job.user });
  await invokeAsyncListener(route._def, "completed", {
    id: job.id,
    route: job.route,
    status: "completed",
    result: completedFile
  });
  return job;
}

async function handlePreflight(
  app: UpliftApp,
  req: Request,
  route: UpliftApp["routes"][string]["_def"]
): Promise<{ ok: true } | { ok: false; error: UploadError }> {
  try {
    const user = await resolveUser(app, route, req);
    const files = await preflightFilesFromRequest(req);
    if (files.length === 0) throw new UploadError("PREFLIGHT_FAILED", "No files were provided for preflight.");
    if (!route.multiple && files.length !== 1) {
      throw new UploadError("PREFLIGHT_FAILED", "This route accepts exactly one file.");
    }
    if (route.multipleLimit !== undefined && files.length > route.multipleLimit) {
      throw new UploadError("PREFLIGHT_FAILED", `This route accepts at most ${route.multipleLimit} files.`);
    }
    for (const file of files) {
      validateStaticFileConstraints(route, file, "PREFLIGHT_FAILED");
      if (route.preflight) {
        const result = await route.preflight({ req, file, user });
        if (result !== true) throw new UploadError("PREFLIGHT_FAILED", result);
      }
    }
    return { ok: true };
  } catch (error) {
    const uploadError = normalizeError(error);
    return {
      ok: false,
      error: uploadError.code === "PREFLIGHT_FAILED"
        ? uploadError
        : new UploadError("PREFLIGHT_FAILED", uploadError.message)
    };
  }
}

export function createRouteManifest(app: UpliftApp): RouteManifest {
  const routes: RouteManifest["routes"] = {};
  for (const [name, route] of Object.entries(app.routes)) {
    const def = route._def;
    routes[name] = {
      kind: def.kind,
      multiple: def.multiple,
      ...(def.multipleLimit !== undefined ? { multipleLimit: def.multipleLimit } : {}),
      ...(def.maxBytes !== undefined ? { maxBytes: def.maxBytes } : {}),
      ...(def.minBytes !== undefined ? { minBytes: def.minBytes } : {}),
      ...(def.mimeTypes ? { mimeTypes: [...def.mimeTypes] } : {}),
      ...(def.extensions ? { extensions: [...def.extensions] } : {}),
      ...(def.outputs && def.outputs.length > 0 ? { outputs: def.outputs.map((output) => output.name) } : {})
    };
  }
  return { routes };
}

export async function readTransformJobStatus(app: UpliftApp, jobId: string): Promise<{
  id: string;
  route: string;
  status: TransformJob["status"];
  progress?: TransformJob["progress"];
  result?: UploadedFile;
  error?: ReturnType<typeof normalizeTransformJobError>;
}> {
  const queue = getTransformJobQueue(app);
  const job = await queue.read(jobId);
  if (!job) throw new UploadError("UNKNOWN_ROUTE", `Unknown Transform Job: ${jobId}`);
  return transformJobStatusPayload(job);
}

function transformJobStatusPayload(job: TransformJob): {
  id: string;
  route: string;
  status: TransformJob["status"];
  progress?: TransformJob["progress"];
  result?: UploadedFile;
  error?: ReturnType<typeof normalizeTransformJobError>;
} {
  return {
    id: job.id,
    route: job.route,
    status: job.status,
    ...(job.progress ? { progress: job.progress } : {}),
    ...(job.result ? { result: job.result.primary } : {}),
    ...(job.error ? { error: job.error } : {})
  };
}

function isTransformJobPayload(value: unknown): value is TransformJob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { route?: unknown }).route === "string" &&
    (
      (value as { status?: unknown }).status === "queued" ||
      (value as { status?: unknown }).status === "processing" ||
      (value as { status?: unknown }).status === "completed" ||
      (value as { status?: unknown }).status === "failed"
    ) &&
    typeof (value as { original?: { key?: unknown } }).original?.key === "string" &&
    typeof (value as { original?: { file?: { name?: unknown; type?: unknown; size?: unknown } } }).original?.file?.name === "string" &&
    typeof (value as { original?: { file?: { name?: unknown; type?: unknown; size?: unknown } } }).original?.file?.type === "string" &&
    typeof (value as { original?: { file?: { name?: unknown; type?: unknown; size?: unknown } } }).original?.file?.size === "number"
  );
}

function getTransformJobQueue(app: UpliftApp): AsyncTransformQueue {
  if (app.asyncTransforms?.queue) return app.asyncTransforms.queue;
  const existing = asyncQueues.get(app);
  if (existing) return existing;
  const queue = createMemoryTransformQueue(app.asyncTransforms?.queueName ? { name: app.asyncTransforms.queueName } : {});
  asyncQueues.set(app, queue);
  return queue;
}

async function acceptAsyncTransformUpload(
  app: UpliftApp,
  req: Request,
  routeName: string,
  route: UpliftApp["routes"][string]["_def"],
  files: FileWithInput[],
  user: unknown
): Promise<AsyncTransformHandlePayload> {
  if (files.length !== 1) {
    throw new UploadError("VALIDATION_FAILED", "Async transform routes currently accept exactly one file.");
  }
  const item = files[0];
  if (!item) throw new UploadError("VALIDATION_FAILED", "No files were uploaded.");
  const meta = await deriveMeta(route, req, item.input, user);
  await validateFile(route, req, item, user, meta);
  assertJsonSerializable(user, "auth context");
  assertJsonSerializable(meta, "metadata");
  const queue = getTransformJobQueue(app);
  const timeout = route.asyncTransformOptions?.timeout ?? app.asyncTransforms?.timeout;
  const originalKey = originalUploadKey(item.input);
  try {
    await app.storage.put({
      key: originalKey,
      file: item.input,
      body: item.body
    });
  } catch (error) {
    const storageError = toStorageError(error, "Original Upload storage failed.");
    throw storageError;
  }
  let job: TransformJob;
  try {
    job = await queue.create({
      route: routeName,
      original: {
        file: item.input,
        key: originalKey,
        ...(app.storage.get ? {} : { body: item.body })
      },
      metadata: meta,
      user,
      ...(timeout ? { timeout } : {}),
      keepOriginal: keepOriginalPolicy(app.asyncTransforms),
      routeContract: routeContractSignature(route)
    });
  } catch (error) {
    await rollbackWrittenFiles(app, [originalKey]);
    throw toStorageError(error, "Transform Job enqueue failed.");
  }
  await invokeAsyncListener(route, "queued", {
    id: job.id,
    route: routeName,
    status: "queued",
    user,
    meta
  });
  return { id: job.id, route: job.route, status: job.status };
}

async function readOriginalUploadBody(app: UpliftApp, job: TransformJob): Promise<File> {
  if (job.original.body) return job.original.body;
  const body = await app.storage.get?.(job.original.key);
  if (!body) {
    throw new UploadError("UPLOAD_FAILED", "Original Upload bytes are unavailable to the async transform worker.");
  }
  return body;
}

function keepOriginalPolicy(config: AsyncTransformsConfig | undefined): false | "failed" | true {
  return config?.keepOriginal ?? "failed";
}

function originalUploadKey(file: UploadInputFile): string {
  const extension = file.extension ? `.${file.extension}` : "";
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `__uplift/originals/${random}/${safeOriginalName(file.name)}${extension}`;
}

function safeOriginalName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "upload";
}

function routeContractSignature(route: UpliftApp["routes"][string]["_def"]): string {
  return JSON.stringify({
    kind: route.kind,
    asyncTransforms: (route.asyncTransforms ?? []).map(transformContractSignature),
    outputs: (route.outputs ?? []).map((output) => ({
      name: output.name,
      produce: output.produce.toString()
    })),
    multiple: route.multiple
  });
}

function transformContractSignature(transform: NonNullable<UpliftApp["routes"][string]["_def"]["asyncTransforms"]>[number]): string {
  return typeof transform === "function" ? transform.toString() : transform.transform.toString();
}

function assertJsonSerializable(value: unknown, label: string): void {
  try {
    rejectNonJsonValue(value, label);
    JSON.stringify(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "value is not JSON-serializable";
    throw new UploadError("VALIDATION_FAILED", `Async transform ${label} must be JSON-serializable: ${message}`);
  }
}

function rejectNonJsonValue(value: unknown, path: string, seen = new Set<object>()): void {
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new UploadError("VALIDATION_FAILED", `${path} contains a non-JSON value.`);
  }
  if (value === undefined) return;
  if (typeof value !== "object" || value === null) return;
  if (seen.has(value)) throw new UploadError("VALIDATION_FAILED", `${path} contains a circular reference.`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectNonJsonValue(item, `${path}[${index}]`, seen));
  } else {
    for (const [key, child] of Object.entries(value)) {
      rejectNonJsonValue(child, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

async function cleanupOriginalUpload(app: UpliftApp, queue: AsyncTransformQueue, job: TransformJob): Promise<void> {
  if (!queue.shouldDeleteOriginal(job) || !app.storage.delete) return;
  try {
    await app.storage.delete(job.original.key);
  } catch {
    // Terminal job state should remain readable even when best-effort cleanup fails.
  }
}

function workerRequest(job: TransformJob): Request {
  return new Request(`https://uplift.local/__async-transform/${encodeURIComponent(job.route)}/${encodeURIComponent(job.id)}`);
}

async function withTransformJobTimeout<T>(job: TransformJob, work: () => Promise<T>): Promise<T> {
  const ms = job.timeout ? durationToMilliseconds(job.timeout) : undefined;
  if (!ms) return work();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new UploadError("TRANSFORM_FAILED", `Transform Job timed out after ${job.timeout}.`));
        }, ms);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function durationToMilliseconds(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(s|m|h)$/.exec(value);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "h") return amount * 60 * 60 * 1000;
  if (unit === "m") return amount * 60 * 1000;
  return amount * 1000;
}

async function invokeAsyncListener(
  route: UpliftApp["routes"][string]["_def"],
  status: "queued" | "processing" | "completed" | "failed",
  ctx: Parameters<NonNullable<NonNullable<typeof route.listeners>[typeof status]>>[0]
): Promise<void> {
  const listener = route.listeners?.[status] as ((value: typeof ctx) => void | Promise<void>) | undefined;
  if (!listener) return;
  try {
    await listener(ctx);
  } catch (error) {
    route.listenerErrors = [
      ...(route.listenerErrors ?? []),
      { status, error: normalizeError(error) }
    ];
  }
}

async function applyTransforms(
  route: UpliftApp["routes"][string]["_def"],
  item: FileWithInput
): Promise<PreparedUploadFile> {
  let prepared: PreparedUploadFile = { file: item.input, body: item.body };
  for (const transform of route.transforms ?? []) {
    const runner = typeof transform === "function" ? transform : transform.transform.bind(transform);
    prepared = await normalizePrepared(await runner(prepared));
  }
  return prepared;
}

async function writeOutputs(
  app: UpliftApp,
  route: UpliftApp["routes"][string]["_def"],
  primaryKey: string,
  prepared: PreparedUploadFile,
  primary: UploadedFile,
  headers: StorageHeaders | undefined,
  writtenKeys: string[],
  assertActive: () => void | Promise<void> = () => undefined
): Promise<Record<string, UploadedFile>> {
  const written: Record<string, UploadedFile> = {};
  for (const output of route.outputs ?? []) {
    await assertActive();
    const outputFile = await normalizePrepared(await output.produce({ ...prepared, primary }));
    await assertActive();
    const key = outputKey(primaryKey, output.name, outputFile.file);
    assertSafeStorageKey(key);
    await assertActive();
    const uploaded = await app.storage.put({
      key,
      file: outputFile.file,
      body: outputFile.body,
      ...(headers ? { headers } : {})
    });
    writtenKeys.push(uploaded.key);
    await assertActive();
    written[output.name] = uploaded;
  }
  return written;
}

async function resolveStorageHeaders(
  route: UpliftApp["routes"][string]["_def"],
  req: Request,
  file: UploadInputFile,
  user: unknown,
  meta: unknown
): Promise<StorageHeaders | undefined> {
  if (!route.storageHeaders) return undefined;
  if (typeof route.storageHeaders === "function") {
    return route.storageHeaders({ req, file, user, meta });
  }
  return route.storageHeaders;
}

async function rollbackWrittenFiles(app: UpliftApp, keys: string[]): Promise<void> {
  if (!app.storage.delete) return;
  for (const key of [...keys].reverse()) {
    try {
      await app.storage.delete(key);
    } catch {
      // Preserve the original upload failure; cleanup is best-effort per adapter.
    }
  }
}

async function normalizePrepared(value: File | PreparedUploadFile): Promise<PreparedUploadFile> {
  if (value instanceof File) return { file: toInputFile(value), body: value };
  const extension = extensionForType(value.file.type) ?? value.file.extension;
  const file = { ...value.file, size: value.body.size };
  if (extension) file.extension = extension;
  return { file, body: value.body };
}

function outputKey(primaryKey: string, name: string, file: UploadInputFile): string {
  const extension = extensionForType(file.type) ?? file.extension;
  return `${primaryKey}/outputs/${name}${extension ? `.${extension}` : ""}`;
}

function assertSafeStorageKey(key: string): void {
  if (key.length === 0) {
    throw new UploadError("UNSAFE_STORAGE_KEY", "Storage key cannot be empty.");
  }
  if (
    key.includes("\0") ||
    key.includes("\\") ||
    key.includes("://") ||
    key.split("/").includes("..") ||
    /^([a-zA-Z]:)?\//.test(key)
  ) {
    throw new UploadError("UNSAFE_STORAGE_KEY", "Storage key must be a relative object key.");
  }
}

function routeNameFromRequest(req: Request): string {
  const url = new URL(req.url);
  const explicit = url.searchParams.get("route");
  if (explicit) return explicit;
  const parts = url.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

async function resolveUser(app: UpliftApp, route: UpliftApp["routes"][string]["_def"], req: Request): Promise<unknown> {
  if (route.overrideAuth) return undefined;
  const middleware = route.auth ?? app.middleware;
  if (!middleware) return undefined;
  try {
    return await middleware({ req });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed.";
    throw new UploadError("AUTH_FAILED", message);
  }
}

async function filesFromRequest(req: Request): Promise<FileWithInput[]> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new UploadError("INVALID_REQUEST", "Upload requests must be multipart/form-data.");
  }

  try {
    const form = await req.formData();
    const files: FileWithInput[] = [];
    for (const value of form.values()) {
      if (!(value instanceof File)) continue;
      files.push({ input: toInputFile(value), body: value });
    }
    return files;
  } catch (error) {
    if (error instanceof UploadError) throw error;
    const message = error instanceof Error ? error.message : "Upload request body could not be parsed.";
    throw new UploadError("INVALID_REQUEST", message);
  }
}

async function deriveMeta(
  route: UpliftApp["routes"][string]["_def"],
  req: Request,
  file: UploadInputFile,
  user: unknown
): Promise<unknown> {
  if (!route.meta) return undefined;
  return route.meta({ req, file, user });
}

async function validateFile(
  route: UpliftApp["routes"][string]["_def"],
  req: Request,
  item: FileWithInput,
  user: unknown,
  meta: unknown
) {
  if (route.maxBytes !== undefined && item.input.size > route.maxBytes) {
    throw new UploadError("FILE_TOO_LARGE", "File is larger than the route allows.");
  }
  validateStaticFileConstraints(route, item.input);
  if (route.schema) {
    try {
      route.schema.parse(await readJsonFile(item.body));
    } catch (error) {
      if (error instanceof UploadError) throw error;
      const message = error instanceof Error ? error.message : "Schema validation failed.";
      throw new UploadError("VALIDATION_FAILED", message);
    }
  }
  await validateConfiguredInspection(route, item.body);
  if (route.validate) {
    const result = await route.validate({ req, file: item.input, user, meta });
    if (result !== true) throw new UploadError("VALIDATION_FAILED", result);
  }
}

function validateStaticFileConstraints(
  route: UpliftApp["routes"][string]["_def"],
  file: UploadInputFile,
  overrideCode?: "PREFLIGHT_FAILED"
): void {
  if (route.maxBytes !== undefined && file.size > route.maxBytes) {
    throw new UploadError(overrideCode ?? "FILE_TOO_LARGE", "File is larger than the route allows.");
  }
  if (route.minBytes !== undefined && file.size < route.minBytes) {
    throw new UploadError(overrideCode ?? "FILE_TOO_SMALL", "File is smaller than the route allows.");
  }
  if (route.kind !== "any" && route.extensions && file.extension && !route.extensions.includes(file.extension)) {
    throw new UploadError(overrideCode ?? "INVALID_TYPE", "File type is not allowed.");
  }
  if (route.kind !== "any" && route.mimeTypes && route.mimeTypes.length > 0) {
    const matches = route.mimeTypes.some((mime) => mime.endsWith("/") ? file.type.startsWith(mime) : file.type === mime);
    if (!matches) throw new UploadError(overrideCode ?? "INVALID_TYPE", "File MIME type is not allowed.");
  }
}

async function preflightFilesFromRequest(req: Request): Promise<UploadInputFile[]> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new UploadError("INVALID_REQUEST", "Preflight requests must be application/json.");
  }
  const body = await req.json() as { files?: Array<Partial<UploadInputFile>> };
  return (body.files ?? []).map((file) => {
    const type = String(file.type ?? "");
    const extension = file.extension ? String(file.extension) : extensionForType(type);
    return {
      name: String(file.name ?? ""),
      type,
      size: Number(file.size ?? 0),
      ...(extension ? { extension } : {})
    };
  });
}

async function validateConfiguredInspection(route: UpliftApp["routes"][string]["_def"], file: File): Promise<void> {
  if (route.dimensionRule || route.requireSquare || route.aspectRatio) {
    throw new UploadError("VALIDATION_FAILED", "Image dimension validation requires an image inspector and is not enabled in core.");
  }
  if (route.encoding) {
    const text = await file.text();
    if (route.encoding === "ascii" && /[^\x00-\x7F]/.test(text)) {
      throw new UploadError("VALIDATION_FAILED", "Text file is not ASCII encoded.");
    }
  }
  if (route.csvColumns) {
    const [headerLine = ""] = (await file.text()).split(/\r?\n/, 1);
    const delimiter = route.delimiter ?? ",";
    const actualHeaders = headerLine.split(delimiter).map((header) => header.trim());
    if (route.csvColumns.some((header, index) => actualHeaders[index] !== header)) {
      throw new UploadError("VALIDATION_FAILED", "CSV columns do not match the route definition.");
    }
  }
  if (route.pageRule || route.encrypted !== undefined || route.durationRule) {
    throw new UploadError("VALIDATION_FAILED", "Rich inspection is configured but no runtime inspector has been installed for this route.");
  }
}

function normalizeError(error: unknown): UploadError {
  if (error instanceof UploadError) return error;
  if (error instanceof Error) return new UploadError("UNKNOWN", error.message);
  return new UploadError("UNKNOWN", "Unknown upload failure.");
}

function statusFor(error: UploadError): number {
  if (error.code === "AUTH_FAILED") return 401;
  if (error.code === "UPLOAD_FAILED" || error.code === "STORAGE_FAILED" || error.code === "UNKNOWN") return 500;
  return 400;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

async function assertTransformJobActive(queue: AsyncTransformQueue, jobId: string, claimToken?: string): Promise<void> {
  const current = await queue.read(jobId);
  if (current?.status === "completed" || current?.status === "failed") {
    throw new UploadError("TRANSFORM_FAILED", "Transform Job is no longer active.");
  }
  if (queue.isClaimActive && !(await queue.isClaimActive(jobId, claimToken))) {
    throw new UploadError("TRANSFORM_FAILED", "Transform Job is no longer active.");
  }
}


function toStorageError(error: unknown, fallback: string): UploadError {
  if (error instanceof UploadError) {
    return error.code === "STORAGE_FAILED"
      ? error
      : new UploadError("STORAGE_FAILED", error.message);
  }
  if (error instanceof Error) return new UploadError("STORAGE_FAILED", error.message || fallback);
  return new UploadError("STORAGE_FAILED", fallback);
}
