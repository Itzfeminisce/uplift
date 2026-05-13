import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import type { TransformContext, UploadOutput, UploadTransform } from "@uplift-io/uplift";

export type ClockTime = `${number}:${number}:${number}` | `${number}:${number}`;
export type Percent = `${number}%`;
export type DurationString = `${number}s` | `${number}m` | `${number}h` | ClockTime;
export type VideoFormat = "mp4" | "mov" | "webm";
export type VideoCodec = "h264" | "h265" | "vp9";
export type AudioCodec = "aac" | "opus" | "mp3";
export type AudioFormat = "aac" | "m4a" | "mp3" | "ogg" | "wav";
export type VideoFit = "contain" | "cover" | "fill";
export type FrameRate = 24 | 25 | 30 | 48 | 50 | 60;
export type Position = ClockTime | Percent;

export type TrimOptions = {
  start?: ClockTime;
  end?: ClockTime;
  duration?: DurationString;
};

export type TranscodeOptions = {
  format: VideoFormat;
  codec?: VideoCodec;
  audioCodec?: AudioCodec;
};

export type CompressOptions = {
  quality: "low" | "medium" | "high";
};

export type ResizeOptions = {
  width?: number;
  height?: number;
  fit?: VideoFit;
};

export type CropOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WatermarkOptions = {
  text: string;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
};

export type VideoOperation =
  | { type: "trim"; options: TrimOptions }
  | { type: "transcode"; options: TranscodeOptions }
  | { type: "compress"; options: CompressOptions }
  | { type: "resize"; options: ResizeOptions }
  | { type: "crop"; options: CropOptions }
  | { type: "watermark"; options: WatermarkOptions }
  | { type: "mute" }
  | { type: "frameRate"; rate: FrameRate }
  | { type: "thumbnail"; options: { at: Position } }
  | { type: "poster"; options: { at: Position } }
  | { type: "storyboard"; options: { every: DurationString } }
  | { type: "extractAudio"; options: { format: AudioFormat } };

export type VideoProcessorInput = {
  input: File;
  outputName: string;
  outputType: string;
  operation: VideoOperation;
};

export type VideoProcessor = (input: VideoProcessorInput) => File | Promise<File>;

type VideoTransform = UploadTransform<"video">;

let processor: VideoProcessor = processWithFfmpeg;

export function setVideoProcessor(nextProcessor: VideoProcessor): void {
  processor = nextProcessor;
}

export function resetVideoProcessor(): void {
  processor = processWithFfmpeg;
}

export function trim(options: TrimOptions): VideoTransform {
  return videoTransform({ type: "trim", options }, sameName, sameType);
}

export function transcode(options: TranscodeOptions): VideoTransform {
  const normalizedOptions = normalizeTranscodeOptions(options);
  return videoTransform(
    { type: "transcode", options: normalizedOptions },
    (body) => replaceExtension(body.name, normalizedOptions.format),
    videoTypeForFormat(normalizedOptions.format)
  );
}

export function compress(options: CompressOptions): VideoTransform {
  return videoTransform({ type: "compress", options }, sameName, sameType);
}

export function resize(options: ResizeOptions): VideoTransform {
  return videoTransform({ type: "resize", options }, sameName, sameType);
}

export function crop(options: CropOptions): VideoTransform {
  return videoTransform({ type: "crop", options }, sameName, sameType);
}

export function watermark(options: WatermarkOptions): VideoTransform {
  return videoTransform({ type: "watermark", options }, sameName, sameType);
}

export function mute(): VideoTransform {
  return videoTransform({ type: "mute" }, sameName, sameType);
}

export function frameRate(rate: FrameRate): VideoTransform {
  return videoTransform({ type: "frameRate", rate }, sameName, sameType);
}

export function thumbnail<const TName extends string>(
  name: TName,
  options: { at: Position }
): UploadOutput<"video", TName> {
  return videoOutput(name, { type: "thumbnail", options }, "jpg", "image/jpeg");
}

export function poster<const TName extends string>(
  name: TName,
  options: { at: Position }
): UploadOutput<"video", TName> {
  return videoOutput(name, { type: "poster", options }, "jpg", "image/jpeg");
}

export function storyboard<const TName extends string>(
  name: TName,
  options: { every: DurationString }
): UploadOutput<"video", TName> {
  return videoOutput(name, { type: "storyboard", options }, "jpg", "image/jpeg");
}

export function extractAudio<const TName extends string>(
  name: TName,
  options: { format: AudioFormat }
): UploadOutput<"video", TName> {
  return videoOutput(name, { type: "extractAudio", options }, options.format, audioTypeForFormat(options.format));
}

function videoTransform(
  operation: VideoOperation,
  nameForResult: (body: File) => string,
  typeForResult: ((body: File) => string) | string
): VideoTransform {
  return {
    async transform({ body }) {
      const outputType = typeof typeForResult === "string" ? typeForResult : typeForResult(body);
      return processor({
        input: body,
        outputName: nameForResult(body),
        outputType,
        operation
      });
    }
  };
}

function videoOutput<const TName extends string>(
  name: TName,
  operation: VideoOperation,
  extension: string,
  type: string
): UploadOutput<"video", TName> {
  return {
    name,
    async produce({ body }) {
      return processor({
        input: body,
        outputName: `${name}.${extension}`,
        outputType: type,
        operation
      });
    }
  };
}

async function processWithFfmpeg(input: VideoProcessorInput): Promise<File> {
  const workdir = await mkdtemp(join(tmpdir(), "uplift-video-"));
  const inputPath = join(workdir, safeTempName(input.input.name, "input", "bin"));
  const outputPath = join(workdir, safeTempName(input.outputName, "output", "bin"));
  try {
    await writeFile(inputPath, Buffer.from(await input.input.arrayBuffer()));
    const args = await ffmpegArgs(input.operation, inputPath, outputPath);
    await runBinary(ffmpegPath(), args, "ffmpeg");
    const output = await readFile(outputPath);
    return new File([toArrayBuffer(output)], input.outputName, { type: input.outputType });
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      throw new Error("ffmpeg is required for @uplift-io/video transforms. Install ffmpeg or set UPLIFT_FFMPEG_PATH.");
    }
    throw error;
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export async function buildFfmpegArgsForTesting(operation: VideoOperation, inputPath: string, outputPath: string): Promise<string[]> {
  return ffmpegArgs(operation, inputPath, outputPath);
}

async function ffmpegArgs(operation: VideoOperation, inputPath: string, outputPath: string): Promise<string[]> {
  const args = ["-hide_banner", "-y"];
  const filters: string[] = [];
  const output: string[] = [];

  if (operation.type === "thumbnail" || operation.type === "poster") {
    args.push("-ss", await positionToTimestamp(operation.options.at, inputPath));
    args.push("-i", inputPath, "-frames:v", "1", "-q:v", "2", outputPath);
    return args;
  }

  args.push("-i", inputPath);

  if (operation.type === "trim") {
    if (operation.options.start) output.push("-ss", operation.options.start);
    if (operation.options.end) output.push("-to", operation.options.end);
    if (operation.options.duration) output.push("-t", durationToFfmpeg(operation.options.duration));
  }

  if (operation.type === "transcode") {
    output.push(...codecArgs(operation.options));
  }

  if (operation.type === "compress") {
    output.push(...compressionCodecArgs(formatForOutputPath(outputPath), operation.options.quality));
  }

  if (operation.type === "resize") filters.push(resizeFilter(operation.options));
  if (operation.type === "crop") filters.push(`crop=${operation.options.width}:${operation.options.height}:${operation.options.x}:${operation.options.y}`);
  if (operation.type === "watermark") filters.push(drawTextFilter(operation.options));
  if (operation.type === "mute") output.push("-an");
  if (operation.type === "frameRate") output.push("-r", String(operation.rate));

  if (operation.type === "storyboard") {
    filters.push(`fps=1/${durationToSeconds(operation.options.every)}`, "scale=320:-1", "tile=5x");
    output.push("-frames:v", "1", "-q:v", "3");
  }

  if (operation.type === "extractAudio") {
    output.push("-vn", ...audioCodecArgs(operation.options.format));
  }

  if (filters.length > 0) output.push("-vf", filters.join(","));
  if (output.length === 0) output.push("-c", "copy");
  output.push(outputPath);
  return [...args, ...output];
}

async function positionToTimestamp(position: Position, inputPath: string): Promise<string> {
  if (!position.endsWith("%")) return position;
  const percent = Number(position.slice(0, -1));
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError("Video position percentages must be between 0% and 100%.");
  }
  const duration = await probeDuration(inputPath);
  return String((duration * percent) / 100);
}

async function probeDuration(inputPath: string): Promise<number> {
  const output = await runBinary(
    ffprobePath(),
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", inputPath],
    "ffprobe"
  );
  const duration = Number(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not determine video duration with ffprobe.");
  return duration;
}

function runBinary(command: string, args: string[], name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${name} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

function codecArgs(options: TranscodeOptions): string[] {
  const normalized = normalizeTranscodeOptions(options);
  return containerCodecArgs(normalized.format, normalized.codec, normalized.audioCodec);
}

function normalizeTranscodeOptions(options: TranscodeOptions): Required<TranscodeOptions> {
  const defaults = defaultCodecsForFormat(options.format);
  const normalized = {
    format: options.format,
    codec: options.codec ?? defaults.codec,
    audioCodec: options.audioCodec ?? defaults.audioCodec
  };
  assertCompatibleCodecs(normalized.format, normalized.codec, normalized.audioCodec);
  return normalized;
}

function defaultCodecsForFormat(format: VideoFormat): Pick<Required<TranscodeOptions>, "codec" | "audioCodec"> {
  if (format === "webm") return { codec: "vp9", audioCodec: "opus" };
  return { codec: "h264", audioCodec: "aac" };
}

function assertCompatibleCodecs(format: VideoFormat, codec: VideoCodec, audioCodec: AudioCodec): void {
  if (!compatibleVideoCodecs(format).includes(codec)) {
    throw new Error(`Video codec "${codec}" is not compatible with the ${format.toUpperCase()} container.`);
  }
  if (!compatibleAudioCodecs(format).includes(audioCodec)) {
    throw new Error(`Audio codec "${audioCodec}" is not compatible with the ${format.toUpperCase()} container.`);
  }
}

function compatibleVideoCodecs(format: VideoFormat): readonly VideoCodec[] {
  if (format === "webm") return ["vp9"];
  return ["h264", "h265"];
}

function compatibleAudioCodecs(format: VideoFormat): readonly AudioCodec[] {
  if (format === "webm") return ["opus"];
  if (format === "mp4") return ["aac", "mp3"];
  return ["aac"];
}

function containerCodecArgs(format: VideoFormat, codec: VideoCodec, audioCodec: AudioCodec): string[] {
  assertCompatibleCodecs(format, codec, audioCodec);
  const args = ["-c:v", videoCodecName(codec), "-c:a", audioCodecName(audioCodec)];
  if (format === "mp4") args.push("-movflags", "+faststart");
  return args;
}

function compressionCodecArgs(format: VideoFormat, quality: CompressOptions["quality"]): string[] {
  const defaults = defaultCodecsForFormat(format);
  const args = containerCodecArgs(format, defaults.codec, defaults.audioCodec);
  if (defaults.codec === "vp9") {
    args.push("-b:v", "0", "-crf", crfForQuality(quality));
    return args;
  }
  args.push("-preset", "medium", "-crf", crfForQuality(quality));
  return args;
}

function formatForOutputPath(outputPath: string): VideoFormat {
  const extension = extname(outputPath).slice(1).toLowerCase();
  if (extension === "mp4" || extension === "mov" || extension === "webm") return extension;
  throw new Error("Video compression requires an MP4, MOV, or WebM output container.");
}

function videoCodecName(codec: VideoCodec): string {
  if (codec === "h264") return "libx264";
  if (codec === "h265") return "libx265";
  return "libvpx-vp9";
}

function audioCodecName(codec: AudioCodec): string {
  if (codec === "aac") return "aac";
  if (codec === "opus") return "libopus";
  return "libmp3lame";
}

function audioCodecArgs(format: AudioFormat): string[] {
  if (format === "mp3") return ["-c:a", "libmp3lame"];
  if (format === "ogg") return ["-c:a", "libopus"];
  if (format === "wav") return ["-c:a", "pcm_s16le"];
  return ["-c:a", "aac"];
}

function resizeFilter(options: ResizeOptions): string {
  const width = options.width;
  const height = options.height;
  if (!width && !height) throw new Error("Video resize requires width, height, or both.");
  if (!width) return `scale=-2:${height}`;
  if (!height) return `scale=${width}:-2`;
  if (options.fit === "cover") return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  if (options.fit === "fill") return `scale=${width}:${height}`;
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
}

function drawTextFilter(options: WatermarkOptions): string {
  const position = options.position ?? "bottom-right";
  const [x, y] = drawTextPosition(position);
  return `drawtext=text='${escapeDrawText(options.text)}':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.45:boxborderw=8:x=${x}:y=${y}`;
}

function drawTextPosition(position: NonNullable<WatermarkOptions["position"]>): [string, string] {
  if (position === "top-left") return ["16", "16"];
  if (position === "top-right") return ["w-tw-16", "16"];
  if (position === "bottom-left") return ["16", "h-th-16"];
  if (position === "center") return ["(w-tw)/2", "(h-th)/2"];
  return ["w-tw-16", "h-th-16"];
}

function escapeDrawText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");
}

function durationToFfmpeg(value: DurationString): string {
  if (value.endsWith("s")) return value.slice(0, -1);
  if (value.endsWith("m")) return String(Number(value.slice(0, -1)) * 60);
  if (value.endsWith("h")) return String(Number(value.slice(0, -1)) * 3600);
  return value;
}

function durationToSeconds(value: DurationString): number {
  if (value.endsWith("s")) return Number(value.slice(0, -1));
  if (value.endsWith("m")) return Number(value.slice(0, -1)) * 60;
  if (value.endsWith("h")) return Number(value.slice(0, -1)) * 3600;
  const parts = value.split(":").map(Number);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

function crfForQuality(quality: CompressOptions["quality"]): string {
  if (quality === "low") return "32";
  if (quality === "medium") return "26";
  return "20";
}

function videoTypeForFormat(format: VideoFormat): string {
  if (format === "mov") return "video/quicktime";
  return `video/${format}`;
}

function audioTypeForFormat(format: AudioFormat): string {
  const typeByFormat: Record<AudioFormat, string> = {
    aac: "audio/aac",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav"
  };
  return typeByFormat[format];
}

function sameName(body: File): string {
  return body.name;
}

function sameType(body: File): string {
  return body.type || "application/octet-stream";
}

function replaceExtension(name: string, extension: string): string {
  const index = name.lastIndexOf(".");
  return `${index >= 0 ? name.slice(0, index) : name}.${extension}`;
}

function safeTempName(name: string, prefix: string, fallbackExtension: string): string {
  const clean = basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  const extension = extname(clean);
  if (clean && extension) return `${prefix}-${clean}`;
  return `${prefix}.${fallbackExtension}`;
}

function ffmpegPath(): string {
  return process.env.UPLIFT_FFMPEG_PATH || "ffmpeg";
}

function ffprobePath(): string {
  return process.env.UPLIFT_FFPROBE_PATH || "ffprobe";
}
