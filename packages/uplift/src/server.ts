import { Readable } from "node:stream";
import Busboy from "busboy";
import { UploadError, type UpliftApp, type UploadedFile, type UploadInputFile } from "./types";
import { defaultKey, readJsonFile, toInputFile } from "./utils";

type FileWithInput = {
  input: UploadInputFile;
  body: File;
};

type StoredFile = {
  file: UploadedFile;
  meta: unknown;
};

export async function handleUploadRequest(app: UpliftApp, req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") {
      return json({ error: new UploadError("VALIDATION_FAILED", "Only POST upload requests are supported.") }, 405);
    }

    const routeName = routeNameFromRequest(req);
    const route = app.routes[routeName];
    if (!route) throw new UploadError("VALIDATION_FAILED", `Unknown upload route: ${routeName}`);

    const user = await resolveUser(app, route._def, req);
    const files = await filesFromRequest(req);
    if (files.length === 0) throw new UploadError("VALIDATION_FAILED", "No files were uploaded.");
    if (!route._def.multiple && files.length !== 1) {
      throw new UploadError("VALIDATION_FAILED", "This route accepts exactly one file.");
    }
    if (route._def.multipleLimit !== undefined && files.length > route._def.multipleLimit) {
      throw new UploadError("VALIDATION_FAILED", `This route accepts at most ${route._def.multipleLimit} files.`);
    }

    const stored: StoredFile[] = [];
    for (const item of files) {
      const meta = await deriveMeta(route._def, req, item.input, user);
      await validateFile(route._def, req, item, user, meta);
      const key = route._def.key ? await route._def.key({ req, file: item.input, user, meta }) : defaultKey(item.input);
      assertSafeStorageKey(key);
      stored.push({
        file: await app.storage.put({ key, file: item.input, body: item.body }),
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
    const uploadError = normalizeError(error);
    return json({ error: uploadError }, statusFor(uploadError));
  }
}

function assertSafeStorageKey(key: string): void {
  if (key.length === 0) {
    throw new UploadError("VALIDATION_FAILED", "Storage key cannot be empty.");
  }
  if (
    key.includes("\0") ||
    key.includes("\\") ||
    key.includes("://") ||
    key.split("/").includes("..") ||
    /^([a-zA-Z]:)?\//.test(key)
  ) {
    throw new UploadError("VALIDATION_FAILED", "Storage key must be a relative object key.");
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
    throw new UploadError("VALIDATION_FAILED", "Upload requests must be multipart/form-data.");
  }

  if (!req.body) {
    throw new UploadError("VALIDATION_FAILED", "Upload request body is empty.");
  }

  try {
    return await filesFromBusboy(req, contentType);
  } catch (error) {
    if (error instanceof UploadError) throw error;
    const message = error instanceof Error ? error.message : "Upload request body could not be parsed.";
    throw new UploadError("VALIDATION_FAILED", message);
  }
}

async function filesFromBusboy(req: Request, contentType: string): Promise<FileWithInput[]> {
  return new Promise((resolve, reject) => {
    const files: Promise<FileWithInput>[] = [];
    const parser = Busboy({ headers: { "content-type": contentType } });

    parser.on("file", (_fieldName, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      files.push(new Promise((fileResolve, fileReject) => {
        stream.on("error", fileReject);
        stream.on("end", () => {
          const bytes = Buffer.concat(chunks);
          const body = new File([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], info.filename, {
            type: info.mimeType
          });
          fileResolve({ input: toInputFile(body), body });
        });
      }));
    });

    parser.on("error", reject);
    parser.on("close", () => {
      Promise.all(files).then(resolve, reject);
    });

    Readable.fromWeb(req.body as never).pipe(parser);
  });
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
  if (route.minBytes !== undefined && item.input.size < route.minBytes) {
    throw new UploadError("FILE_TOO_SMALL", "File is smaller than the route allows.");
  }
  if (route.kind !== "any" && route.extensions && item.input.extension && !route.extensions.includes(item.input.extension)) {
    throw new UploadError("INVALID_TYPE", "File type is not allowed.");
  }
  if (route.kind !== "any" && route.mimeTypes && route.mimeTypes.length > 0) {
    const matches = route.mimeTypes.some((mime) => mime.endsWith("/") ? item.input.type.startsWith(mime) : item.input.type === mime);
    if (!matches) throw new UploadError("INVALID_TYPE", "File MIME type is not allowed.");
  }
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
  if (route.headers) {
    const [headerLine = ""] = (await file.text()).split(/\r?\n/, 1);
    const delimiter = route.delimiter ?? ",";
    const actualHeaders = headerLine.split(delimiter).map((header) => header.trim());
    if (route.headers.some((header, index) => actualHeaders[index] !== header)) {
      throw new UploadError("VALIDATION_FAILED", "CSV headers do not match the route definition.");
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
