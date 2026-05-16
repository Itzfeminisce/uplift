import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StorageAdapter } from "@uplift-io/uplift";

export function local(directory: string, options: { publicBaseUrl?: string } = {}): StorageAdapter {
  return {
    provider: "local",
    async put({ key, file, body }) {
      const path = join(directory, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, Buffer.from(await body.arrayBuffer()));
      return {
        url: joinUrl(options.publicBaseUrl, key),
        key,
        name: file.name,
        type: file.type,
        size: file.size,
        extension: file.extension,
        provider: "local"
      };
    },
    async delete(key) {
      await rm(join(directory, key), { force: true });
    },
    async get(key) {
      const bytes = await readFile(join(directory, key)).catch((error: unknown) => {
        if (isNotFoundError(error)) return undefined;
        throw error;
      });
      if (!bytes) return undefined;
      return new File([bytes], key.split("/").pop() ?? "upload", { type: "application/octet-stream" });
    }
  };
}

function joinUrl(baseUrl: string | undefined, key: string): string {
  if (!baseUrl) return `/${key}`;
  return `${baseUrl.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}
