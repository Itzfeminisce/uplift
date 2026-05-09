import type { StorageAdapter } from "../types";

export type CloudinaryOptions = {
  cloudName: string;
  uploadPreset?: string;
  client?: { upload(input: unknown): Promise<{ secure_url?: string; public_id?: string }> };
};

export function cloudinary(options: CloudinaryOptions): StorageAdapter {
  return {
    provider: "cloudinary",
    async put({ key, file }) {
      const result = options.client ? await options.client.upload({ key, file }) : {};
      return {
        url: result.secure_url ?? `https://res.cloudinary.com/${options.cloudName}/${key}`,
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
