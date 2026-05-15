import { UploadError, type StorageAdapter, type StorageHeaders } from "@uplift-io/uplift";

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
    async put({ key, file, body, headers }) {
      const fetcher = options.fetch ?? fetch;
      const response = await fetcher(`https://${options.storageHostname ?? "storage.bunnycdn.com"}/${options.zone}/${key}`, {
        method: "PUT",
        headers: {
          ...bunnyObjectHeaders(headers),
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
    },
    async delete(key) {
      const fetcher = options.fetch ?? fetch;
      const response = await fetcher(`https://${options.storageHostname ?? "storage.bunnycdn.com"}/${options.zone}/${key}`, {
        method: "DELETE",
        headers: {
          AccessKey: options.apiKey
        }
      });
      if (!response.ok) {
        throw new UploadError("UPLOAD_FAILED", `Bunny delete failed with status ${response.status}.`);
      }
    }
  };
}

function bunnyObjectHeaders(headers: StorageHeaders | undefined): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    switch (name.toLowerCase()) {
      case "cache-control":
        safe["Cache-Control"] = value;
        break;
      case "content-disposition":
        safe["Content-Disposition"] = value;
        break;
      case "content-encoding":
        safe["Content-Encoding"] = value;
        break;
      case "content-language":
        safe["Content-Language"] = value;
        break;
      case "expires":
        safe.Expires = value;
        break;
    }
  }
  return safe;
}
