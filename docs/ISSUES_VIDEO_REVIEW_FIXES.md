# Video Review Fixes Issue Breakdown

Source: local code review of uncommitted media processing changes.

This file keeps the issue plan local. Each item is written as a GitHub-ready issue body, but no remote issue has been created.

## Proposed Breakdown

1. **Make video transcode defaults container-safe**
   - Type: AFK
   - Blocked by: None
   - User stories covered: Video uploads can be transcoded reliably without requiring callers to know ffmpeg container/codec compatibility.

2. **Make video compression container-aware**
   - Type: AFK
   - Blocked by: None
   - User stories covered: Video uploads can be compressed without generating invalid codec/container combinations.

3. **Isolate mocked video processor state in tests**
   - Type: AFK
   - Blocked by: None
   - User stories covered: Test failures do not leak global processor state into later tests.

---

## Issue 1: Make Video Transcode Defaults Container-Safe

## What to build

Update `@uplift-io/video` so `transcode()` always emits ffmpeg arguments that are compatible with the requested output container. A route using `transcode({ format: "webm" })` should produce a valid WebM by default, and explicit incompatible codec/container combinations should fail fast with a clear error before spawning ffmpeg.

## Acceptance criteria

- [x] `transcode({ format: "mp4" })` uses container-compatible default video/audio codecs.
- [x] `transcode({ format: "mov" })` uses container-compatible default video/audio codecs.
- [x] `transcode({ format: "webm" })` uses WebM-compatible default video/audio codecs.
- [x] Explicit codec/container combinations that ffmpeg cannot mux are rejected with a clear error.
- [x] Explicit audio codec/container combinations that ffmpeg cannot mux are rejected with a clear error.
- [x] Tests cover `webm` transcode defaults without relying on `-c copy`.
- [x] Tests cover at least one rejected incompatible combination, such as WebM plus H.264.
- [x] Package docs briefly explain the default codec choices or compatibility behavior.

## Blocked by

None - can start immediately.

---

## Issue 2: Make Video Compression Container-Aware

## What to build

Update `@uplift-io/video` compression so it does not blindly encode every input with H.264 while preserving the original extension. Compression should choose a codec compatible with the current container, or require/produce a compatible output container when the requested operation cannot be represented safely.

## Acceptance criteria

- [x] Compressing an MP4 input emits ffmpeg arguments compatible with MP4 output.
- [x] Compressing a WebM input emits ffmpeg arguments compatible with WebM output.
- [x] Compressing a MOV input emits ffmpeg arguments compatible with MOV output.
- [x] Unsupported or unknown input containers fail fast with a clear error instead of producing invalid ffmpeg arguments.
- [x] Tests cover WebM compression and assert it does not use `libx264` with a `.webm` output.
- [x] Tests cover MP4 compression and preserve the existing quality mapping behavior where compatible.
- [x] Docs describe compression container behavior and any unsupported cases.

## Blocked by

None - can start immediately.

---

## Issue 3: Isolate Mocked Video Processor State In Tests

## What to build

Harden tests that call `setVideoProcessor()` so a failure in one test cannot leave the module-global video processor mocked for later tests. Reset should happen through `try/finally` or a test-level cleanup hook.

## Acceptance criteria

- [x] Every test that calls `setVideoProcessor()` resets it in a `finally` block or shared `afterEach`.
- [x] If the upload request throws, `resetVideoProcessor()` still runs.
- [x] If an assertion fails before the end of the test, `resetVideoProcessor()` still runs.
- [x] A regression test or cleanup assertion proves processor state does not leak between tests.
- [x] The test suite still passes with `pnpm --filter @uplift-io/tests test`.

## Blocked by

None - can start immediately.
