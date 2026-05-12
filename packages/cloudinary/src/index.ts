import { UploadError, type StorageAdapter } from "@uplift-io/uplift";

export type CloudinaryOptions = {
  cloudName: string;
  uploadPreset?: string;
  folder?: string;
  fetch?: typeof fetch;
};

export function cloudinary(options: CloudinaryOptions): StorageAdapter {
  return {
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
      const result = await response.json() as { secure_url?: string; public_id?: string; error?: { message?: string } };
      if (!response.ok || !result.secure_url) {
        throw new UploadError("UPLOAD_FAILED", result.error?.message ?? `Cloudinary upload failed with status ${response.status}.`);
      }
      return {
        url: result.secure_url,
        key: result.public_id ?? key,
        name: file.name,
        type: file.type,
        size: file.size,
        extension: file.extension,
        provider: "cloudinary"
      };
    }
  };
}
