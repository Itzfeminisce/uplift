import { UploadError, type StorageAdapter, type StoragePutInput, type UploadedFile } from "../types";

export type UploadThingFileResult = {
  url?: string | null;
  ufsUrl?: string | null;
  appUrl?: string | null;
  key?: string | null;
  name?: string | null;
  type?: string | null;
  size?: number | null;
};

export type UploadThingUploadResponse =
  | UploadThingFileResult
  | {
      data: UploadThingFileResult | null;
      error: { message?: string; code?: string; data?: unknown } | null;
    };

export type UploadThingUploader = (
  file: File | File[],
  input: StoragePutInput
) => Promise<UploadThingUploadResponse | UploadThingUploadResponse[]>;

export type UploadThingOptions = {
  uploader: UploadThingUploader;
};

export function uploadthing(options: UploadThingOptions): StorageAdapter {
  return {
    provider: "uploadthing",
    async put(input) {
      const result = await options.uploader(input.body, input);
      const uploaded = normalizeUploadThingResult(Array.isArray(result) ? result[0] : result);
      if (!uploaded) {
        throw new UploadError("UPLOAD_FAILED", "UploadThing did not return an uploaded file.");
      }

      const url = uploaded.ufsUrl ?? uploaded.url ?? uploaded.appUrl;
      if (!url) {
        throw new UploadError("UPLOAD_FAILED", "UploadThing did not return a file URL.");
      }

      return {
        url,
        key: uploaded.key ?? input.key,
        name: uploaded.name ?? input.file.name,
        type: uploaded.type ?? input.file.type,
        size: uploaded.size ?? input.file.size,
        extension: input.file.extension,
        provider: "uploadthing"
      } satisfies UploadedFile;
    }
  };
}

function normalizeUploadThingResult(result: UploadThingUploadResponse | undefined): UploadThingFileResult | undefined {
  if (!result) return undefined;
  if (isWrappedUploadThingResponse(result)) {
    if (result.error) {
      throw new UploadError("UPLOAD_FAILED", result.error.message ?? "UploadThing rejected the upload.");
    }
    return result.data ?? undefined;
  }
  return result;
}

function isWrappedUploadThingResponse(result: UploadThingUploadResponse): result is Extract<
  UploadThingUploadResponse,
  { data: UploadThingFileResult | null }
> {
  return "data" in result;
}
