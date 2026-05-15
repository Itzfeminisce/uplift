import { createHash } from "node:crypto";
import { UploadError, type StorageAdapter } from "@uplift-io/uplift";

export type CloudinaryOptions = {
  cloudName: string;
  uploadPreset?: string;
  folder?: string;
  apiKey?: string;
  apiSecret?: string;
  invalidate?: boolean;
  fetch?: typeof fetch;
};

export function cloudinary(options: CloudinaryOptions): StorageAdapter {
  const resourceTypes = new Map<string, string>();
  const adapter: StorageAdapter = {
    provider: "cloudinary",
    async put({ key, file, body }) {
      if (!options.uploadPreset) {
        throw new UploadError("UPLOAD_FAILED", "Cloudinary uploads require an unsigned uploadPreset.");
      }
      const form = new FormData();
      form.append("file", body);
      form.append("upload_preset", options.uploadPreset);
      form.append("public_id", key);
      if (options.folder) form.append("folder", options.folder);
      const fetcher = options.fetch ?? fetch;
      const response = await fetcher(`https://api.cloudinary.com/v1_1/${options.cloudName}/auto/upload`, {
        method: "POST",
        body: form
      });
      const result = await response.json() as {
        secure_url?: string;
        public_id?: string;
        resource_type?: string;
        error?: { message?: string };
      };
      if (!response.ok || !result.secure_url) {
        throw new UploadError("UPLOAD_FAILED", result.error?.message ?? `Cloudinary upload failed with status ${response.status}.`);
      }
      const publicId = result.public_id ?? key;
      const resourceType = result.resource_type ?? resourceTypeFor(file.type);
      resourceTypes.set(publicId, resourceType);
      return {
        url: result.secure_url,
        key: publicId,
        name: file.name,
        type: file.type,
        size: file.size,
        extension: file.extension,
        provider: "cloudinary"
      };
    }
  };
  if (options.apiKey && options.apiSecret) {
    const apiKey = options.apiKey;
    const apiSecret = options.apiSecret;
    adapter.delete = async (key) => {
      const resourceType = resourceTypes.get(key) ?? "image";
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const params: Record<string, string> = {
        public_id: key,
        timestamp
      };
      if (options.invalidate) params.invalidate = "true";
      const form = new FormData();
      for (const [name, value] of Object.entries(params)) form.append(name, value);
      form.append("api_key", apiKey);
      form.append("signature", signCloudinaryParams(params, apiSecret));

      const fetcher = options.fetch ?? fetch;
      const response = await fetcher(`https://api.cloudinary.com/v1_1/${options.cloudName}/${resourceType}/destroy`, {
        method: "POST",
        body: form
      });
      const result = await response.json() as { result?: string; error?: { message?: string } };
      if (!response.ok || result.result === "error") {
        throw new UploadError("UPLOAD_FAILED", result.error?.message ?? `Cloudinary delete failed with status ${response.status}.`);
      }
    };
  }
  return adapter;
}

function resourceTypeFor(contentType: string): string {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/") || contentType.startsWith("audio/")) return "video";
  return "raw";
}

function signCloudinaryParams(params: Record<string, string>, apiSecret: string): string {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}
