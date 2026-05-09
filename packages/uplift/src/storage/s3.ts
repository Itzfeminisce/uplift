import type { StorageAdapter } from "../types";

export type S3Options = {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  publicBaseUrl?: string;
  client?: { send(command: unknown): Promise<unknown> };
};

export function s3(options: S3Options): StorageAdapter {
  return {
    provider: "s3",
    async put({ key, file }) {
      if (options.client) {
        await options.client.send({ type: "PutObject", bucket: options.bucket, key, contentType: file.type });
      }
      return {
        url: `${options.publicBaseUrl ?? `https://${options.bucket}.s3.${options.region}.amazonaws.com`}/${key}`,
        key,
        name: file.name,
        type: file.type,
        size: file.size,
        extension: file.extension,
        provider: "s3"
      };
    }
  };
}
