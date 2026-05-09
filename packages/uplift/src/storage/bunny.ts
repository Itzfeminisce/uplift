import type { StorageAdapter } from "../types";

export type BunnyOptions = {
  apiKey: string;
  zone: string;
  hostname?: string;
};

export function bunny(options: BunnyOptions): StorageAdapter {
  return {
    provider: "bunny",
    async put({ key, file }) {
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
