# Media Transforms and Outputs Issue Breakdown

Source PRD: `docs/PRD_MEDIA_TRANSFORMS_AND_OUTPUTS.md`

This file keeps the issue plan local. Each item is written as a GitHub-ready issue body, but no remote issue has been created.

Production-readiness correction: this checklist now tracks the real media-engine implementation, not just API scaffolding. Issues 3, 5, and 6 are only complete when Sharp or ffmpeg-backed processing creates real artifacts and tests verify those artifacts or an explicit processor boundary.

## Proposed Breakdown

1. **Add typed primary transform pipeline to core**
   - Type: AFK
   - Blocked by: None
   - User stories covered: 3, 4, 6, 7, 10, 15, 20, 25

2. **Add typed derived outputs pipeline and result getter**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: 5, 8, 9, 17, 18, 19, 25

3. **Create `@uplift-io/image` with first image transforms**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: 1, 6, 10, 11, 20, 21

4. **Add image `variant` outputs**
   - Type: AFK
   - Blocked by: 2, 3
   - User stories covered: 5, 8, 9, 12, 17, 18, 19

5. **Create `@uplift-io/video` with synchronous video transforms**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: 2, 7, 10, 13, 20, 21, 23, 24

6. **Add video derived outputs**
   - Type: AFK
   - Blocked by: 2, 5
   - User stories covered: 5, 8, 9, 14, 17, 18, 19, 23, 24

7. **Deprecate or remove vague rich inspection surface from core docs**
   - Type: AFK
   - Blocked by: 3, 5
   - User stories covered: 21, 22

8. **Document media processing operational model**
   - Type: AFK
   - Blocked by: 4, 6
   - User stories covered: 3, 18, 19, 20, 23, 24, 26, 27

9. **Update static site for media processing launch**
   - Type: AFK
   - Blocked by: 4, 6, 8
   - User stories covered: 3, 21, 23, 24, 26

10. **Add media packages to smoke-pack and docs snippet verification**
   - Type: AFK
   - Blocked by: 3, 5
   - User stories covered: 27, 28, 30

11. **Harden CI and release workflows for media package publishing**
   - Type: AFK
   - Blocked by: 10
   - User stories covered: 28, 29, 30

12. **Finalize release readiness checklist for media packages**
   - Type: AFK
   - Blocked by: 7, 8, 9, 11
   - User stories covered: 26, 27, 28, 29, 30

---

## Issue 1: Add Typed Primary Transform Pipeline To Core

## What to build

Add the core transform contract and `.transform(...transforms)` builder method so upload routes can change the primary uploaded file before key generation and storage adapter writes. This slice should use test transforms inside the core test suite rather than depending on Sharp or ffmpeg.

The end-to-end behavior should prove that an uploaded file can enter the normal upload route, pass existing cheap validation, be transformed into a new primary file, have `.key()` receive the final metadata, and be handed to the configured storage adapter as the prepared file.

## Acceptance criteria

- [x] Core exports a generic transform type that does not import media-specific dependencies.
- [x] Upload builders expose `.transform(...transforms)`.
- [x] Transforms compose left to right.
- [x] A transform can update primary file bytes, name, type, size, and extension.
- [x] Extension is derived from final type when possible rather than manually trusted.
- [x] `.key()` receives the transformed primary file metadata.
- [x] Storage adapters receive the transformed primary file body and metadata through the existing storage abstraction.
- [x] The frontend upload method shape remains unchanged.
- [x] Type tests prove image routes accept image-compatible transforms and reject incompatible transforms where the route kind is known.
- [x] Runtime tests cover successful transformation and transform failure propagation.

## Blocked by

None - can start immediately.

---

## Issue 2: Add Typed Derived Outputs Pipeline And Result Getter

## What to build

Add `.outputs(...outputs)` to upload builders so a route can declare additional named files derived from the transformed primary file. Add typed output names to route/client result inference and expose a typed getter on uploaded results, while keeping the wire response serializable.

This slice should use fake output producers in tests. It should prove that declared outputs are written through the configured storage adapter, returned with the result, and accessible through a typed client result getter.

## Acceptance criteria

- [x] Core exports a generic output contract that preserves output names as literal types.
- [x] Upload builders expose `.outputs(...outputs)`.
- [x] Outputs run after primary transforms.
- [x] Output names flow into the uploaded result type.
- [x] Client-facing uploaded results expose `output("name")` for declared outputs.
- [x] Accessing an undeclared output name is a TypeScript error.
- [x] The server response remains plain JSON without methods.
- [x] The client attaches or exposes the typed output getter after parsing the JSON response.
- [x] Output files use convention-based keys in v1.
- [x] If any output adapter write fails, the whole upload request fails.
- [x] If the storage adapter implements `delete(key)`, output failure rolls back the primary and any earlier outputs best-effort.
- [x] Runtime tests cover primary success plus output success.
- [x] Runtime tests cover primary success plus output failure resulting in upload failure.

## Blocked by

- Blocked by Issue 1.

---

## Issue 3: Create `@uplift-io/image` With First Image Transforms

## What to build

Create the `@uplift-io/image` domain package and implement the first set of Sharp-backed primary image transforms. The package should provide typed transformer functions that can be passed to `image().transform(...)` without exposing Sharp through the Uplift core API.

This slice should cover the most common optimization flow: resize, convert, compress, and metadata stripping.

## Acceptance criteria

- [x] Workspace contains an `@uplift-io/image` package with build, typecheck, and export configuration consistent with existing packages.
- [x] The package depends on image processing tooling internally without adding that dependency to core.
- [x] `resize` is implemented with Sharp-backed width, height, fit, and without-enlargement options.
- [x] `convert` is implemented with Sharp format output, updated extension, and updated MIME type.
- [x] `compress` is implemented with real Sharp quality handling for supported formats.
- [x] `strip` is implemented through Sharp output without preserving metadata.
- [x] Image transforms return core-compatible transform functions.
- [x] Type tests prove image transforms are accepted by `image().transform(...)`.
- [x] Runtime tests use deterministic image fixtures and verify final type, extension, size, and successful adapter write.
- [x] Package docs or snippets show a basic image optimization pipeline.

## Blocked by

- Blocked by Issue 1.

---

## Issue 4: Add Image `variant` Outputs

## What to build

Add image output support through `variant`, allowing developers to derive named image artifacts from the transformed primary image by reusing image transforms. This gives routes typed thumbnails and previews without adding many specialized image output helpers.

## Acceptance criteria

- [x] `@uplift-io/image` exports `variant`.
- [x] `variant` accepts a literal output name and one or more image transforms.
- [x] `variant` preserves the output name in the route/client result type.
- [x] Image variants derive from the transformed primary image.
- [x] Image variant outputs are handed to the configured storage adapter.
- [x] Image variant output keys follow the v1 convention.
- [x] Client results can access declared variants with `uploaded.output("name")`.
- [x] Type tests prove undeclared variant names are rejected.
- [x] Runtime tests cover at least thumbnail and preview variants.

## Blocked by

- Blocked by Issue 2.
- Blocked by Issue 3.

---

## Issue 5: Create `@uplift-io/video` With Synchronous Video Transforms

## What to build

Create the `@uplift-io/video` domain package and implement synchronous, request-time primary video transforms. The package should expose typed transformer functions for trimming, transcoding, compression, resizing, cropping, watermarking, muting, and frame-rate changes, while keeping ffmpeg concerns out of core.

This slice should establish the package boundary, typed DSL, and at least one working end-to-end synchronous transform path.

## Acceptance criteria

- [x] Workspace contains an `@uplift-io/video` package with build, typecheck, and export configuration consistent with existing packages.
- [x] The package owns its video processing dependency or host binary integration without adding video dependencies to core.
- [x] The default processor shells out to host ffmpeg and ffprobe, with env-var path overrides.
- [x] Video transform option types avoid unbounded strings where possible.
- [x] Video time values use typed clock-time and percentage formats.
- [x] Durations use typed duration strings.
- [x] Formats, codecs, audio codecs, fit modes, and frame rates are typed.
- [x] `trim`, `transcode`, `compress`, `resize`, `crop`, `watermark`, `mute`, and `frameRate` map to real ffmpeg operations.
- [x] Video transforms return core-compatible transform functions.
- [x] Type tests prove video transforms are accepted by `video().transform(...)`.
- [x] Runtime tests verify final type, extension, and successful adapter write for a small fixture or mocked processing path.
- [x] Tests or docs make ffmpeg availability requirements explicit.
- [x] Tests can inject a deterministic processor while production defaults to ffmpeg.

## Blocked by

- Blocked by Issue 1.

---

## Issue 6: Add Video Derived Outputs

## What to build

Add video output producers for thumbnails, posters, storyboards, and extracted audio. Outputs should derive from the transformed primary video, preserve literal output names, and integrate with the core typed output getter.

This slice should prove the route can return a primary video plus typed derived artifacts without making the frontend aware of processing internals.

## Acceptance criteria

- [x] `@uplift-io/video` exports `thumbnail`, `poster`, `storyboard`, and `extractAudio`.
- [x] Each output producer accepts a literal `as` name and preserves it in the route/client result type.
- [x] `thumbnail` and `poster` accept typed timestamp or percentage positions.
- [x] `storyboard` accepts typed interval durations.
- [x] `extractAudio` accepts a typed audio format union.
- [x] Video outputs derive from the transformed primary video.
- [x] Video outputs are handed to the configured storage adapter.
- [x] Video output keys follow the v1 convention.
- [x] Client results can access declared outputs with `uploaded.output("name")`.
- [x] Type tests prove undeclared video output names are rejected.
- [x] Runtime tests cover at least one image output and one audio output path, using fixtures or mocked processing where needed.
- [x] Default video outputs map to real ffmpeg/ffprobe commands rather than placeholder files.

## Blocked by

- Blocked by Issue 2.
- Blocked by Issue 5.

---

## Issue 7: Deprecate Vague Rich Inspection Surface And Remove It From Public Docs

## What to build

Deprecate the existing rich inspection concept and remove it from public docs as the preferred media extension model. Update public docs and examples so media capability packages are the documented path for image and video behavior.

## Acceptance criteria

- [x] `@uplift-io/rich` is documented as deprecated or legacy where it still appears.
- [x] Public docs remove `@uplift-io/rich` as the recommended path for media features.
- [x] Existing core inspection methods are documented as deprecated or removed from public docs.
- [x] Public docs no longer position vague rich inspection as the primary media extension model.
- [x] Docs explain `@uplift-io/image` and `@uplift-io/video` as domain capability packages.
- [x] Migration notes explain the move from rich inspection language to domain packages.
- [x] Tests and snippets are updated to match the chosen direction.

## Blocked by

- Blocked by Issue 3.
- Blocked by Issue 5.

---

## Issue 8: Document Media Processing Operational Model

## What to build

Document the developer-facing model for media transforms and outputs: core stays small, media packages own dependencies, transforms mutate the primary file, outputs create typed derived artifacts, output keys use convention, failures fail the whole upload, and video processing is synchronous and deployment-sensitive in v1.

## Acceptance criteria

- [x] README or docs include an image optimization example.
- [x] README or docs include an image variants example.
- [x] README or docs include a video transform example.
- [x] README or docs include a video thumbnail/poster output example.
- [x] Docs explain `.transform()` versus `.outputs()`.
- [x] Docs explain `uploaded.output("name")` and its type behavior.
- [x] Docs explain convention-based output keys.
- [x] Docs explain that any output failure fails the upload request.
- [x] Docs explain adapter-level cleanup via optional `delete(key)`.
- [x] Docs explain that video processing runs during the upload request in v1.
- [x] Docs explain ffmpeg/ffprobe hosting considerations and path overrides for video processing.
- [x] Docs confirm the frontend upload API remains unchanged.
- [x] Docs snippets include image and video examples that are covered by typechecking.
- [x] Package READMEs for core, image, and video explain dependency boundaries.

## Blocked by

- Blocked by Issue 4.
- Blocked by Issue 6.

---

## Issue 9: Update Static Site For Media Processing Launch

## What to build

Update the static website so the public product narrative includes image and video media processing without making Uplift look like hosted media infrastructure. The site should show that transforms and outputs are server-side route capabilities, while the frontend API remains route-named and simple.

This slice covers the launch-facing site surface, including examples, feature copy, package positioning, and any bundle-size/package-size displays that appear on the site.

## Acceptance criteria

- [x] Site examples show an image route using `.transform(...)`.
- [x] Site examples show an image route using `.outputs(...)` with variants.
- [x] Site examples show a video route using `.transform(...)`.
- [x] Site examples show a video route using `.outputs(...)` with thumbnail or poster.
- [x] Site copy explains `@uplift-io/image` and `@uplift-io/video` as optional domain packages.
- [x] Site copy keeps the frontend usage simple and unchanged.
- [x] Site copy does not imply hosted queues, background jobs, dashboards, or media infrastructure.
- [x] Site copy clearly distinguishes primary transforms from derived outputs.
- [x] Any package or bundle-size data shown on the site is regenerated or updated if needed.
- [x] The site remains static and publishable through the existing Pages workflow.

## Blocked by

- Blocked by Issue 4.
- Blocked by Issue 6.
- Blocked by Issue 8.

---

## Issue 10: Add Media Packages To Smoke-Pack And Docs Snippet Verification

## What to build

Update local publish verification so the new image and video packages are packed, installed into the smoke consumer, imported, and typechecked. Update docs snippet typechecking so examples that mention media transforms and outputs are verified against source.

This slice ensures the new packages are not only implemented, but also installable and usable from a consumer app before publish.

## Acceptance criteria

- [x] `scripts/smoke-pack.mjs` packs `@uplift-io/image`.
- [x] `scripts/smoke-pack.mjs` packs `@uplift-io/video`.
- [x] The smoke consumer installs the packed image and video packages.
- [x] The smoke consumer imports image transforms and video transforms.
- [x] The smoke consumer compiles a route using image `.transform(...)`.
- [x] The smoke consumer compiles a route using video `.transform(...)`.
- [x] The smoke consumer compiles declared outputs and typed output access where practical.
- [x] Docs snippets include media examples.
- [x] Docs snippet `tsconfig` resolves `@uplift-io/image` and `@uplift-io/video` to source.
- [x] `pnpm docs:check` verifies media snippets.
- [x] `pnpm smoke:pack` verifies packed media package installation.

## Blocked by

- Blocked by Issue 3.
- Blocked by Issue 5.

---

## Issue 11: Harden CI And Release Workflows For Media Package Publishing

## What to build

Make sure the existing CI and release workflows build, test, smoke-pack, and publish the new image and video packages. Confirm any environment requirements for video tests are handled explicitly so CI remains reliable.

This slice is about release mechanics: package inclusion, verification order, host dependencies, and avoiding accidental publication gaps.

## Acceptance criteria

- [x] Workspace package filters include image and video packages through existing `@uplift-io/*` patterns.
- [x] CI runs build, typecheck, test, docs check, bundle-size check, and smoke-pack with media packages included.
- [x] Video tests that require ffmpeg are either backed by a reliable CI dependency, mocked, or skipped with an explicit host-requirement reason.
- [x] Release workflow publishes `@uplift-io/image` and `@uplift-io/video`.
- [x] Release workflow still excludes only intended non-publish packages.
- [x] Package metadata for image and video is publication-ready.
- [x] Changesets or release notes account for new packages and core API additions.
- [x] Bundle-size reporting still demonstrates that core Uplift does not include media dependencies.

## Blocked by

- Blocked by Issue 10.

---

## Issue 12: Prepare 1.1.0 Release Checklist, Changelog, And Version Bump

## What to build

Create or update the release checklist for the media transform/output launch, update the changelog, and bump package versions to `1.1.0`. This slice should prepare the repo for publishing the media packages and core API additions after implementation, docs, site, smoke-pack, and workflow coverage are complete.

## Acceptance criteria

- [x] Release checklist names all packages involved in the launch.
- [x] Checklist confirms core remains free of Sharp and ffmpeg dependencies.
- [x] Checklist confirms image and video packages install and typecheck from packed tarballs.
- [x] Checklist confirms docs snippets pass.
- [x] Checklist confirms site content is updated.
- [x] Checklist confirms CI is green.
- [x] Checklist confirms video operational caveats are documented.
- [x] Checklist confirms rich inspection deprecation or positioning is resolved.
- [x] Checklist confirms package READMEs and root README agree.
- [x] Changelog documents the `1.1.0` media transforms and outputs release.
- [x] Package versions are updated to `1.1.0` where this repo manages versions directly.
- [x] Changesets or equivalent release notes are prepared if the release process requires them.

## Blocked by

- Blocked by Issue 7.
- Blocked by Issue 8.
- Blocked by Issue 9.
- Blocked by Issue 11.

