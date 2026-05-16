import { UploadError, type AsyncTransformDoneOptions, type UpliftApp, type UploadClient } from "./types";

export type UploadProgressHandler = (progress: number) => void;

export function createUploadClient<TApp extends UpliftApp>(
  baseUrl: string,
  options: { fetch?: typeof fetch; onProgress?: (route: string, progress: number) => void } = {}
): UploadClient<TApp> {
  const fetcher = options.fetch ?? fetch;
  const controls = new Map<string, {
    controller: AbortController | undefined;
    retryInput?: File | File[] | FileList;
  }>();

  return new Proxy({}, {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      const state = controls.get(property) ?? { controller: undefined };
      controls.set(property, state);
      const upload = async (input: File | File[] | FileList) => {
        state.controller?.abort(new UploadError("ABORTED", "Upload attempt was aborted."));
        const controller = new AbortController();
        state.controller = controller;
        const files = input instanceof File ? [input] : Array.from(input);
        const form = new FormData();
        const field = files.length === 1 ? "file" : "files";
        for (const file of files) form.append(field, file);

        const url = routeUrl(baseUrl, property);
        try {
          if (!options.fetch && typeof XMLHttpRequest !== "undefined") {
            const result = await uploadWithXhr(url, form, property, controller.signal, options.onProgress);
            delete state.retryInput;
            return result;
          }

          options.onProgress?.(property, 0);
          const response = await fetcher(url, { method: "POST", body: form, signal: controller.signal });
          const body = await response.json() as { result?: unknown; error?: { code: string; message: string } };
          if (!response.ok) {
            throw new UploadError((body.error?.code ?? "UNKNOWN") as never, body.error?.message ?? "Upload failed.");
          }
          options.onProgress?.(property, 100);
          delete state.retryInput;
          return attachClientResult(body.result, baseUrl, fetcher);
        } catch (error) {
          state.retryInput = input;
          if (controller.signal.aborted) throw abortError(controller.signal.reason);
          throw error;
        } finally {
          if (state.controller === controller) state.controller = undefined;
        }
      };
      Object.defineProperties(upload, {
        abort: {
          value() {
            state.controller?.abort(new UploadError("ABORTED", "Upload attempt was aborted."));
          }
        },
        retry: {
          value() {
            if (!state.retryInput) {
              return Promise.reject(new UploadError("VALIDATION_FAILED", `No retryable upload attempt exists for route: ${property}`));
            }
            return upload(state.retryInput);
          }
        },
        preflight: {
          async value(input: File | File[] | FileList) {
            const files = input instanceof File ? [input] : Array.from(input);
            const response = await fetcher(routeUrl(baseUrl, property, { preflight: "1" }), {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                files: files.map((file) => ({
                  name: file.name,
                  type: file.type,
                  size: file.size,
                  extension: extensionFromName(file.name)
                }))
              })
            });
            const body = await response.json() as {
              ok: boolean;
              error?: { code: string; message: string };
            };
            if (!body.ok) {
              return {
                ok: false as const,
                error: {
                  code: (body.error?.code ?? "PREFLIGHT_FAILED") as never,
                  message: body.error?.message ?? "Preflight check failed."
                }
              };
            }
            return {
              ok: true as const,
              upload: () => upload(input)
            };
          }
        }
      });
      return upload;
    }
  }) as UploadClient<TApp>;
}

function routeUrl(baseUrl: string, route: string, params: Record<string, string> = {}): string {
  const url = new URL(baseUrl, globalThis.location?.href ?? "http://localhost");
  url.searchParams.set("route", route);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const value = url.toString();
  return baseUrl.startsWith("/") ? `${url.pathname}${url.search}` : value;
}

function extensionFromName(name: string): string | undefined {
  const index = name.lastIndexOf(".");
  return index === -1 ? undefined : name.slice(index + 1).toLowerCase();
}

function uploadWithXhr(
  url: string,
  form: FormData,
  route: string,
  signal: AbortSignal,
  onProgress?: (route: string, progress: number) => void
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal.addEventListener("abort", () => {
      xhr.abort();
      reject(abortError(signal.reason));
    }, { once: true });
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(route, Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || "{}") as {
        result?: unknown;
        error?: { code: string; message: string };
      };
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new UploadError((body.error?.code ?? "UNKNOWN") as never, body.error?.message ?? "Upload failed."));
        return;
      }
      onProgress?.(route, 100);
      resolve(attachClientResult(body.result, url, fetch));
    };
    xhr.onabort = () => reject(abortError(signal.reason));
    xhr.onerror = () => reject(new UploadError("UPLOAD_FAILED", "Upload request failed."));
    onProgress?.(route, 0);
    xhr.send(form);
  });
}

function abortError(reason: unknown): UploadError {
  if (reason instanceof UploadError) return reason;
  return new UploadError("ABORTED", "Upload attempt was aborted.");
}

function attachOutputGetters(result: unknown): unknown {
  if (Array.isArray(result)) return result.map((item) => attachOutputGetters(item));
  if (!isUploadedFileLike(result)) return result;
  if (!Object.prototype.hasOwnProperty.call(result, "output")) {
    Object.defineProperty(result, "output", {
      enumerable: false,
      value(name: string) {
        const output = result.outputs?.[name];
        if (!output) throw new UploadError("VALIDATION_FAILED", `Unknown output: ${name}`);
        return attachOutputGetters(output);
      }
    });
  }
  if (result.outputs) {
    for (const output of Object.values(result.outputs)) attachOutputGetters(output);
  }
  return result;
}

function attachClientResult(result: unknown, baseUrl: string, fetcher: typeof fetch): unknown {
  if (isAsyncTransformHandleLike(result)) return attachAsyncTransformDone(result, baseUrl, fetcher);
  return attachOutputGetters(result);
}

function attachAsyncTransformDone(
  handle: { id: string; route: string; status: string; done?: (options?: AsyncTransformDoneOptions) => Promise<unknown> },
  baseUrl: string,
  fetcher: typeof fetch
): unknown {
  let terminal: Promise<unknown> | undefined;
  Object.defineProperty(handle, "done", {
    enumerable: false,
    value(options: AsyncTransformDoneOptions = {}) {
      terminal ??= pollTransformJob(baseUrl, handle.id, fetcher, options);
      return terminal;
    }
  });
  return handle;
}

async function pollTransformJob(
  baseUrl: string,
  jobId: string,
  fetcher: typeof fetch,
  options: AsyncTransformDoneOptions
): Promise<unknown> {
  const startedAt = Date.now();
  for (;;) {
    assertPollingActive(options, startedAt);
    const response = await fetcher(statusUrl(baseUrl, jobId));
    const body = await response.json() as unknown;
    if (!response.ok) {
      const error = isObject(body) && isObject(body.error) ? body.error : undefined;
      throw new UploadError((typeof error?.code === "string" ? error.code : "UNKNOWN") as never, typeof error?.message === "string" ? error.message : "Transform Job status failed.");
    }
    if (!isTransformJobStatusPayload(body)) {
      throw new UploadError("INVALID_REQUEST", "Transform Job status response was malformed.");
    }
    if (body.status === "completed") return attachOutputGetters(body.result);
    if (body.status === "failed") {
      throw new UploadError((body.error?.code ?? "UNKNOWN") as never, body.error?.message ?? "Transform Job failed.");
    }
    assertPollingActive(options, startedAt);
    await delay(50);
  }
}

function assertPollingActive(options: AsyncTransformDoneOptions, startedAt: number): void {
  if (options.signal?.aborted) throw abortError(options.signal.reason);
  if (options.timeoutMs !== undefined && Date.now() - startedAt >= options.timeoutMs) {
    throw new UploadError("ABORTED", "Transform Job polling timed out.");
  }
}

function statusUrl(baseUrl: string, jobId: string): string {
  const url = new URL(baseUrl, globalThis.location?.href ?? "http://localhost");
  url.searchParams.set("job", jobId);
  const value = url.toString();
  return baseUrl.startsWith("/") ? `${url.pathname}${url.search}` : value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAsyncTransformHandleLike(value: unknown): value is { id: string; route: string; status: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "route" in value &&
    "status" in value &&
    !("key" in value)
  );
}

function isTransformJobStatusPayload(value: unknown): value is {
  status: "queued" | "processing" | "completed" | "failed";
  result?: unknown;
  error?: { code?: string; message?: string };
} {
  return isObject(value) && (
    value.status === "queued" ||
    value.status === "processing" ||
    value.status === "completed" ||
    value.status === "failed"
  );
}

function isUploadedFileLike(value: unknown): value is {
  outputs?: Record<string, unknown>;
  output?: (name: string) => unknown;
} {
  return typeof value === "object" && value !== null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
