import { UploadError, type StorageAdapter } from "@uplift-io/uplift";

export type BunnyOptions = {
  apiKey: string;
  zone: string;
  hostname?: string;
  storageHostname?: string;
  fetch?: typeof fetch;
};

export function bunny(options: BunnyOptions): StorageAdapter {
  return {
    provider: "bunny",
    async put({ key, file, body }) {
      const fetcher = options.fetch ?? fetch;
      const response = await fetcher(`https://${options.storageHostname ?? "storage.bunnycdn.com"}/${options.zone}/${key}`, {
        method: "PUT",
        headers: {
          AccessKey: options.apiKey,
          "Content-Type": file.type || "application/octet-stream"
        },
        body
      });
      if (!response.ok) {
        throw new UploadError("UPLOAD_FAILED", `Bunny upload failed with status ${response.status}.`);
      }
      return {
        url: `https://${options.hostname ?? `${options.zone}.b-cdn.net`}/${key}`,
        key,
        name: file.name,
        type: file.type,
        size: file.size,
        extension: file.extension,
        provider: "bunny"
      };
    }
  };
}
