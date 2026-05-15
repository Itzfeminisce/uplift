import {
  UploadError,
  type PreparedUploadFile,
  type RouteManifest,
  type StorageHeaders,
  type UpliftApp,
  type UploadedFile,
  type UploadInputFile
} from "./types";
import { defaultKey, extensionForType, readJsonFile, toInputFile } from "./utils";

type FileWithInput = {
  input: UploadInputFile;
  body: File;
};

type StoredFile = {
  file: UploadedFile;
  meta: unknown;
};

export async function handleUploadRequest(app: UpliftApp, req: Request): Promise<Response> {
  const writtenKeys: string[] = [];
  try {
    if (req.method === "HEAD") {
      return new Response(null, { status: 204 });
    }
    if (req.method === "GET") {
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
  writtenKeys: string[]
): Promise<Record<string, UploadedFile>> {
  const written: Record<string, UploadedFile> = {};
  for (const output of route.outputs ?? []) {
    const outputFile = await normalizePrepared(await output.produce({ ...prepared, primary }));
    const key = outputKey(primaryKey, output.name, outputFile.file);
    assertSafeStorageKey(key);
    const uploaded = await app.storage.put({
      key,
      file: outputFile.file,
      body: outputFile.body,
      ...(headers ? { headers } : {})
    });
    written[output.name] = uploaded;
    writtenKeys.push(uploaded.key);
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
  if (error.code === "UPLOAD_FAILED" || error.code === "UNKNOWN") return 500;
  return 400;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}
