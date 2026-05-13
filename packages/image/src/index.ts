import sharp, { type FitEnum, type Sharp } from "sharp";
import type { TransformContext, UploadOutput, UploadTransform } from "@uplift-io/uplift";

export type ImageFormat = "avif" | "gif" | "jpeg" | "jpg" | "png" | "webp";
export type ImageFit = "contain" | "cover" | "fill" | "inside" | "outside";

export type ResizeOptions = {
  width?: number;
  height?: number;
  fit?: ImageFit;
  withoutEnlargement?: boolean;
};

export type CompressOptions = {
  quality: number;
};

type ImageTransform = UploadTransform<"image">;
type SharpFormat = "avif" | "gif" | "jpeg" | "png" | "webp";

export function resize(options: ResizeOptions): ImageTransform {
  return imageTransform(async (pipeline) =>
    pipeline.resize({
      width: options.width,
      height: options.height,
      fit: options.fit as keyof FitEnum | undefined,
      withoutEnlargement: options.withoutEnlargement
    })
  );
}

export function convert(format: ImageFormat): ImageTransform {
  const outputFormat = normalizeFormat(format);
  return imageTransform(
    async (pipeline) => pipeline.toFormat(outputFormat),
    ({ body }) => replaceExtension(body.name, extensionForFormat(outputFormat)),
    mimeForFormat(outputFormat)
  );
}

export function compress(options: CompressOptions): ImageTransform {
  assertQuality(options.quality);
  return imageTransform(async (pipeline, ctx) => {
    const format = await formatFor(ctx.body);
    return applyQuality(pipeline, format, options.quality);
  });
}

export function strip(): ImageTransform {
  return imageTransform(async (pipeline, ctx) => pipeline.toFormat(await formatFor(ctx.body)));
}

export function variant<const TName extends string>(
  name: TName,
  ...transforms: ImageTransform[]
): UploadOutput<"image", TName> {
  return {
    name,
    async produce(ctx) {
      let current: TransformContext = { file: ctx.file, body: ctx.body };
      for (const transform of transforms) {
        const result = await transform.transform(current);
        current = result instanceof File ? fileToPrepared(result) : result;
      }
      return current;
    }
  };
}

function imageTransform(
  apply: (pipeline: Sharp, ctx: TransformContext) => Sharp | Promise<Sharp>,
  nameForResult?: (ctx: TransformContext) => string,
  typeForResult?: string
): ImageTransform {
  return {
    async transform(ctx) {
      const input = Buffer.from(await ctx.body.arrayBuffer());
      const pipeline = sharp(input, { animated: true, failOn: "error" }).rotate();
      const output = await apply(pipeline, ctx);
      const { data, info } = await output.toBuffer({ resolveWithObject: true });
      const format = normalizeFormat(info.format as ImageFormat);
      const type = typeForResult ?? mimeForFormat(format);
      const name = nameForResult?.(ctx) ?? replaceExtension(ctx.body.name, extensionForFormat(format));
      return new File([toArrayBuffer(data)], name, { type });
    }
  };
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function applyQuality(pipeline: Sharp, format: SharpFormat, quality: number): Sharp {
  if (format === "jpeg") return pipeline.jpeg({ quality, mozjpeg: true });
  if (format === "png") return pipeline.png({ quality, compressionLevel: 9, adaptiveFiltering: true });
  if (format === "webp") return pipeline.webp({ quality });
  if (format === "avif") return pipeline.avif({ quality });
  if (format === "gif") return pipeline.gif();
  return pipeline;
}

async function formatFor(file: File): Promise<SharpFormat> {
  const byType = formatForType(file.type);
  if (byType) return byType;
  const input = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(input, { animated: true }).metadata();
  if (!metadata.format) throw new Error("Unsupported image format.");
  return normalizeFormat(metadata.format as ImageFormat);
}

function assertQuality(quality: number): void {
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new RangeError("Image quality must be an integer from 1 to 100.");
  }
}

function normalizeFormat(format: ImageFormat): SharpFormat {
  return format === "jpg" ? "jpeg" : format;
}

function extensionForFormat(format: SharpFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

function mimeForFormat(format: SharpFormat): string {
  return `image/${format === "jpeg" ? "jpeg" : format}`;
}

function formatForType(type: string): SharpFormat | undefined {
  const normalized = type.toLowerCase().split(";")[0]?.trim();
  if (normalized === "image/jpeg") return "jpeg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/avif") return "avif";
  if (normalized === "image/gif") return "gif";
  return undefined;
}

function fileToPrepared(body: File): TransformContext {
  const file = {
    name: body.name,
    type: body.type,
    size: body.size,
    file: body
  };
  const extension = extensionFor(body.name);
  if (extension) return { body, file: { ...file, extension } };
  return {
    body,
    file
  };
}

function replaceExtension(name: string, extension: string): string {
  const index = name.lastIndexOf(".");
  return `${index >= 0 ? name.slice(0, index) : name}.${extension}`;
}

function extensionFor(name: string): string | undefined {
  const index = name.lastIndexOf(".");
  return index >= 0 && index < name.length - 1 ? name.slice(index + 1).toLowerCase() : undefined;
}
