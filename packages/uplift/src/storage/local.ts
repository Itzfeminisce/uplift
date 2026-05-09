import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StorageAdapter } from "../types";

export function local(directory: string, options: { publicBaseUrl?: string } = {}): StorageAdapter {
  return {
    provider: "local",
    async put({ key, file, body }) {
      const path = join(directory, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, Buffer.from(await body.arrayBuffer()));
      return {
        url: `${options.publicBaseUrl ?? ""}/${key}`.replace(/\/+/g, "/"),
        key,
        name: file.name,
        type: file.type,
        size: file.size,
        extension: file.extension,
        provider: "local"
      };
    }
  };
}
