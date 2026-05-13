import { UploadError, type SizeValue, type UploadInputFile } from "./types";

const sizeUnits = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024
} as const;

export function parseSize(value: SizeValue): number {
  const match = /^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/.exec(value);
  if (!match) throw new UploadError("VALIDATION_FAILED", `Invalid size value: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof sizeUnits;
  return Math.floor(amount * sizeUnits[unit]);
}

export function extensionFor(name: string): string | undefined {
  const index = name.lastIndexOf(".");
  if (index < 0 || index === name.length - 1) return undefined;
  return name.slice(index + 1).toLowerCase();
}

export function extensionForType(type: string): string | undefined {
  const normalized = type.toLowerCase().split(";")[0]?.trim();
  if (!normalized) return undefined;
  const known: Record<string, string> = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "application/json": "json",
    "application/pdf": "pdf",
    "text/csv": "csv",
    "text/plain": "txt"
  };
  return known[normalized];
}

export function toInputFile(file: File): UploadInputFile {
  const extension = extensionForType(file.type) ?? extensionFor(file.name);
  const input: UploadInputFile = {
    name: file.name,
    type: file.type,
    size: file.size,
    file
  };
  if (extension) input.extension = extension;
  return input;
}

export function defaultKey(file: UploadInputFile): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${random}/${file.name}`;
}

export async function readJsonFile(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new UploadError("VALIDATION_FAILED", "Invalid JSON file.");
  }
}
