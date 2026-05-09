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

        options.onProgress?.(property, 0);
        const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/${property}`, {
          method: "POST",
          body: form
        });
        options.onProgress?.(property, 100);

        const body = await response.json() as { result?: unknown; error?: { code: string; message: string } };
        if (!response.ok) {
          throw new UploadError((body.error?.code ?? "UNKNOWN") as never, body.error?.message ?? "Upload failed.");
        }
        return body.result;
      };
    }
  }) as UploadClient<TApp>;
}
