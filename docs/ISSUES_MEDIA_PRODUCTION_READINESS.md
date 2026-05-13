# Media Production Readiness Issues

These local issue files were created from the review findings. They are GitHub-ready, but no remote issues were created.

## Issue 1: Replace Image Placeholders With Sharp Processing

## What to build

Make `@uplift-io/image` create real image artifacts for primary transforms and variants while keeping Sharp out of core.

## Acceptance criteria

- [x] `@uplift-io/image` depends on Sharp internally.
- [x] `resize()` changes real dimensions with width, height, fit, and without-enlargement support.
- [x] `convert()` transcodes pixels and updates name, MIME type, and extension.
- [x] `compress()` applies real quality settings for supported formats.
- [x] `strip()` emits image bytes without preserving metadata.
- [x] Runtime tests generate deterministic fixtures and assert real format/dimension changes.

## Blocked by

None - can start immediately.

---

## Issue 2: Replace Video Placeholders With ffmpeg Processing

## What to build

Make `@uplift-io/video` produce real media artifacts through a production ffmpeg boundary, while allowing deterministic tests to inject a processor.

## Acceptance criteria

- [x] Default processing shells out to host ffmpeg/ffprobe.
- [x] `UPLIFT_FFMPEG_PATH` and `UPLIFT_FFPROBE_PATH` can override binary paths.
- [x] Trim, transcode, compress, resize, crop, watermark, mute, and frame-rate changes map to ffmpeg commands.
- [x] Thumbnail, poster, storyboard, and audio extraction outputs map to ffmpeg commands.
- [x] Missing ffmpeg produces a clear operational error.
- [x] Runtime tests verify the package operation boundary with a mocked processor.

## Blocked by

None - can start immediately.

---

## Issue 3: Add Output Cleanup Semantics

## What to build

Document and implement best-effort cleanup for output failures without making every storage adapter transactional.

## Acceptance criteria

- [x] `StorageAdapter` exposes optional `delete(key)`.
- [x] Memory and local adapters implement `delete(key)`.
- [x] When an output write fails, core calls `delete(key)` for the primary and earlier outputs if available.
- [x] Cleanup failures do not mask the original upload failure.
- [x] Tests cover cleanup on output write failure.
- [x] Docs explain the optional cleanup behavior.

## Blocked by

None - can start immediately.
