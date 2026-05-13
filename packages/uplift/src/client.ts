import { UploadError, type UpliftApp, type UploadClient } from "./types";

export type UploadProgressHandler = (progress: number) => void;

export function createUploadClient<TApp extends UpliftApp>(
  baseUrl: string,
  options: { fetch?: typeof fetch; onProgress?: (route: string, progress: number) => void } = {}
): UploadClient<TApp> {
  const fetcher = options.fetch ?? fetch;

  return new Proxy({}, {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      return async (input: File | File[] | FileList) => {
        const files = input instanceof File ? [input] : Array.from(input);
        const form = new FormData();
        const field = files.length === 1 ? "file" : "files";
        for (const file of files) form.append(field, file);

        const url = routeUrl(baseUrl, property);
        if (!options.fetch && typeof XMLHttpRequest !== "undefined") {
          return uploadWithXhr(url, form, property, options.onProgress);
        }

        options.onProgress?.(property, 0);
        const response = await fetcher(url, { method: "POST", body: form });
        const body = await response.json() as { result?: unknown; error?: { code: string; message: string } };
        if (!response.ok) {
          throw new UploadError((body.error?.code ?? "UNKNOWN") as never, body.error?.message ?? "Upload failed.");
        }
        options.onProgress?.(property, 100);
        return attachOutputGetters(body.result);
      };
    }
  }) as UploadClient<TApp>;
}

function routeUrl(baseUrl: string, route: string): string {
  const url = new URL(baseUrl, globalThis.location?.href ?? "http://localhost");
  url.searchParams.set("route", route);
  const value = url.toString();
  return baseUrl.startsWith("/") ? `${url.pathname}${url.search}` : value;
}

function uploadWithXhr(
  url: string,
  form: FormData,
  route: string,
  onProgress?: (route: string, progress: number) => void
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
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
      resolve(attachOutputGetters(body.result));
    };
    xhr.onerror = () => reject(new UploadError("UPLOAD_FAILED", "Upload request failed."));
    onProgress?.(route, 0);
    xhr.send(form);
  });
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

function isUploadedFileLike(value: unknown): value is {
  outputs?: Record<string, unknown>;
  output?: (name: string) => unknown;
} {
  return typeof value === "object" && value !== null;
}
