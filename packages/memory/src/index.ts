import type { StorageAdapter } from "../types";

export function createMemoryStorage(): StorageAdapter {
  const objects = new Map<string, File>();
  return {
    provider: "memory",
    async put({ key, file, body }) {
      objects.set(key, body);
      return {
        url: `memory://${key}`,
        key,
        name: file.name,
        type: file.type,
        size: file.size,
        extension: file.extension,
        provider: "memory"
      };
    }
  };
}
