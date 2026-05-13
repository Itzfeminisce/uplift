import { describe, expect, it } from "vitest";
import {
  buildFfmpegArgsForTesting,
  resetVideoProcessor,
  setVideoProcessor,
  transcode,
  type VideoOperation
} from "@uplift-io/video";

function videoFile(name: string, type: string) {
  return new File(["video"], name, { type });
}

function transformContext(body: File) {
  return {
    body,
    file: {
      name: body.name,
      type: body.type,
      size: body.size
    }
  };
}

describe("@uplift-io/video", () => {
  it("uses container-safe defaults for WebM transcodes", async () => {
    const operations: VideoOperation[] = [];
    try {
      setVideoProcessor(async ({ outputName, outputType, operation }) => {
        operations.push(operation);
        return new File(["webm"], outputName, { type: outputType });
      });

      const result = await transcode({ format: "webm" }).transform(transformContext(videoFile("clip.mp4", "video/mp4")));
      expect(result).toBeInstanceOf(File);

      const output = result as File;
      expect(output.name).toBe("clip.webm");
      expect(output.type).toBe("video/webm");
      expect(operations).toEqual([
        { type: "transcode", options: { format: "webm", codec: "vp9", audioCodec: "opus" } }
      ]);
    } finally {
      resetVideoProcessor();
    }
  });

  it("rejects incompatible transcode codec and container combinations before processing", () => {
    expect(() => transcode({ format: "webm", codec: "h264" })).toThrow(
      'Video codec "h264" is not compatible with the WEBM container.'
    );
    expect(() => transcode({ format: "webm", audioCodec: "aac" })).toThrow(
      'Audio codec "aac" is not compatible with the WEBM container.'
    );
  });

  it("builds ffmpeg transcode arguments with container-compatible codecs", async () => {
    await expect(
      buildFfmpegArgsForTesting(
        { type: "transcode", options: { format: "mp4" } },
        "input.webm",
        "output.mp4"
      )
    ).resolves.toEqual([
      "-hide_banner",
      "-y",
      "-i",
      "input.webm",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "output.mp4"
    ]);

    await expect(
      buildFfmpegArgsForTesting(
        { type: "transcode", options: { format: "mov" } },
        "input.webm",
        "output.mov"
      )
    ).resolves.toContain("libx264");

    await expect(
      buildFfmpegArgsForTesting(
        { type: "transcode", options: { format: "webm" } },
        "input.mp4",
        "output.webm"
      )
    ).resolves.toEqual([
      "-hide_banner",
      "-y",
      "-i",
      "input.mp4",
      "-c:v",
      "libvpx-vp9",
      "-c:a",
      "libopus",
      "output.webm"
    ]);
  });

  it("builds compression arguments for the output container", async () => {
    await expect(
      buildFfmpegArgsForTesting(
        { type: "compress", options: { quality: "medium" } },
        "input.mp4",
        "output.mp4"
      )
    ).resolves.toEqual([
      "-hide_banner",
      "-y",
      "-i",
      "input.mp4",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "-preset",
      "medium",
      "-crf",
      "26",
      "output.mp4"
    ]);

    const webmArgs = await buildFfmpegArgsForTesting(
      { type: "compress", options: { quality: "low" } },
      "input.webm",
      "output.webm"
    );
    expect(webmArgs).toContain("libvpx-vp9");
    expect(webmArgs).toContain("libopus");
    expect(webmArgs).not.toContain("libx264");

    await expect(
      buildFfmpegArgsForTesting(
        { type: "compress", options: { quality: "high" } },
        "input.mov",
        "output.mov"
      )
    ).resolves.toContain("libx264");
  });

  it("rejects compression for unsupported output containers", async () => {
    await expect(
      buildFfmpegArgsForTesting(
        { type: "compress", options: { quality: "medium" } },
        "input.avi",
        "output.avi"
      )
    ).rejects.toThrow("Video compression requires an MP4, MOV, or WebM output container.");
  });

  it("resets mocked processor state in cleanup after a thrown upload path", async () => {
    const previousFfmpegPath = process.env.UPLIFT_FFMPEG_PATH;
    try {
      setVideoProcessor(async () => {
        throw new Error("processor unavailable");
      });
      await expect(
        transcode({ format: "mp4" }).transform(transformContext(videoFile("clip.webm", "video/webm")))
      ).rejects.toThrow("processor unavailable");
    } finally {
      resetVideoProcessor();
    }

    try {
      process.env.UPLIFT_FFMPEG_PATH = "uplift-missing-ffmpeg";
      await expect(
        transcode({ format: "mp4" }).transform(transformContext(videoFile("clip.webm", "video/webm")))
      ).rejects.toThrow("ffmpeg is required for @uplift-io/video transforms.");
    } finally {
      if (previousFfmpegPath === undefined) {
        delete process.env.UPLIFT_FFMPEG_PATH;
      } else {
        process.env.UPLIFT_FFMPEG_PATH = previousFfmpegPath;
      }
    }
  });
});
