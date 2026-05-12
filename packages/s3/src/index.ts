import { PutObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { UploadError, type StorageAdapter } from "@uplift-io/uplift";

export type S3Options = {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  publicBaseUrl?: string;
  client?: Pick<S3Client, "send">;
  forcePathStyle?: boolean;
};

export function s3(options: S3Options): StorageAdapter {
  const client = options.client ?? new S3Client(clientConfig(options));
  return {
    provider: "s3",
    async put({ key, file, body }) {
      await client.send(new PutObjectCommand({
        Bucket: options.bucket,
        Key: key,
        Body: new Uint8Array(await body.arrayBuffer()),
        ContentType: file.type
      })).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "S3 upload failed.";
        throw new UploadError("UPLOAD_FAILED", message);
      });
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

function clientConfig(options: S3Options): S3ClientConfig {
  const config: S3ClientConfig = { region: options.region };
  if (options.endpoint) config.endpoint = options.endpoint;
  if (options.forcePathStyle !== undefined) config.forcePathStyle = options.forcePathStyle;
  if (options.accessKeyId && options.secretAccessKey) {
    config.credentials = {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey
    };
  }
  return config;
}
