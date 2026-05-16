import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { UploadError, type StorageAdapter, type StorageHeaders } from "@uplift-io/uplift";

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
    async put({ key, file, body, headers }) {
      await client.send(new PutObjectCommand({
        Bucket: options.bucket,
        Key: key,
        Body: new Uint8Array(await body.arrayBuffer()),
        ContentType: file.type,
        ...s3ObjectHeaders(headers)
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
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({
        Bucket: options.bucket,
        Key: key
      })).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "S3 delete failed.";
        throw new UploadError("UPLOAD_FAILED", message);
      });
    },
    async get(key) {
      const result = await client.send(new GetObjectCommand({
        Bucket: options.bucket,
        Key: key
      })).catch((error: unknown) => {
        if (isNotFoundError(error)) return undefined;
        const message = error instanceof Error ? error.message : "S3 read failed.";
        throw new UploadError("UPLOAD_FAILED", message);
      });
      if (!result?.Body) return undefined;
      const bytes = await bodyToUint8Array(result.Body);
      return new File([toArrayBuffer(bytes)], key.split("/").pop() ?? "upload", {
        type: result.ContentType ?? "application/octet-stream"
      });
    }
  };
}

async function bodyToUint8Array(body: unknown): Promise<Uint8Array> {
  if (body && typeof body === "object" && "transformToByteArray" in body) {
    return (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
  }
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body && typeof body === "object" && Symbol.asyncIterator in body) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    }
    return new Uint8Array(await new Blob(chunks.map(toArrayBuffer)).arrayBuffer());
  }
  throw new UploadError("UPLOAD_FAILED", "S3 read returned an unsupported body.");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ((error as { name?: unknown }).name === "NoSuchKey" || (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode === 404)
  );
}

function s3ObjectHeaders(headers: StorageHeaders | undefined) {
  const mapped: {
    CacheControl?: string;
    ContentDisposition?: string;
    ContentEncoding?: string;
    ContentLanguage?: string;
    Expires?: Date;
  } = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    switch (name.toLowerCase()) {
      case "cache-control":
        mapped.CacheControl = value;
        break;
      case "content-disposition":
        mapped.ContentDisposition = value;
        break;
      case "content-encoding":
        mapped.ContentEncoding = value;
        break;
      case "content-language":
        mapped.ContentLanguage = value;
        break;
      case "expires": {
        const date = new Date(value);
        if (!Number.isNaN(date.valueOf())) mapped.Expires = date;
        break;
      }
    }
  }
  return mapped;
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
