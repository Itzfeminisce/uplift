# Uplift Media Transforms and Outputs PRD

## Problem Statement

Uplift currently lets developers define typed upload routes, validate cheap file facts, derive storage keys, and hand uploaded files to a configured storage adapter. It does not yet provide a first-class way to process uploaded media before it reaches storage, and the existing rich inspection surface is too vague for the direction of the product.

Developers building image-heavy and video-heavy products need a simple, typed way to resize, convert, compress, trim, transcode, watermark, and derive extra artifacts such as thumbnails and posters. They should get this without exposing Sharp, ffmpeg, or media tooling details through the public Uplift core API, and without making the frontend aware that processing exists.

## Solution

Add media processing as typed, server-side route capabilities while keeping Uplift core small. Core upload builders such as `image()` and `video()` will expose two pipeline methods:

- `.transform(...)` changes the primary uploaded file before it is handed to the configured storage adapter.
- `.outputs(...)` creates additional named files derived from the transformed primary file.

Media-specific processing functions will live in domain packages:

- `@uplift-io/image` for image transforms and image outputs.
- `@uplift-io/video` for video transforms and video outputs.

The core package will know about generic transform and output contracts, but it will not depend on Sharp, ffmpeg, or any other media runtime. The media packages own those dependencies.

The frontend remains unchanged. Client code continues to call route-named upload methods such as `upload.avatar(file)` or `upload.clip(file)`. When a route declares outputs, the returned uploaded file exposes a typed output getter, such as `uploaded.output("thumbnail")`.

## User Stories

1. As a TypeScript application developer, I want to process uploaded images on the server, so that I can store optimized assets instead of raw user uploads.
2. As a TypeScript application developer, I want to process uploaded videos on the server, so that I can normalize clips before they are saved.
3. As a frontend developer, I want upload calls to stay unchanged, so that media processing remains a server-side concern.
4. As a backend developer, I want `.transform()` to change the primary uploaded file, so that storage keys and returned metadata describe the final stored artifact.
5. As a backend developer, I want `.outputs()` to create additional named files, so that thumbnails, posters, previews, and extracted audio can be returned with the upload result.
6. As a backend developer, I want `image().transform(...)` to accept image transforms, so that I cannot accidentally pass video transforms to an image route.
7. As a backend developer, I want `video().transform(...)` to accept video transforms, so that video processing APIs remain type-safe.
8. As a backend developer, I want output names to be preserved as literal types, so that `uploaded.output("thumbnail")` is type-safe.
9. As a frontend developer, I want unknown output names to fail at compile time, so that typos in output access are caught before runtime.
10. As a backend developer, I want media APIs to avoid free-form strings where possible, so that TypeScript checks timestamps, formats, codecs, durations, fit modes, and output names.
11. As a backend developer, I want image resizing, conversion, compression, metadata stripping, watermarking, cropping, rotation, orientation, sharpening, flattening, trimming, blur, and grayscale transforms, so that common image processing workflows are covered.
12. As a backend developer, I want image variants as outputs, so that I can create thumbnails and previews without inventing a separate route.
13. As a backend developer, I want video trimming, transcoding, compression, resizing, cropping, watermarking, muting, and frame-rate transforms, so that common video normalization workflows are covered.
14. As a backend developer, I want video thumbnails, posters, storyboards, and extracted audio as outputs, so that a single video upload can return related media artifacts.
15. As a backend developer, I want `.key()` to receive the transformed primary file metadata, so that storage keys reflect the final extension and type.
16. As a backend developer, I want metadata derivation to describe the original upload context, so that app-specific metadata can be based on what the user sent.
17. As a backend developer, I want completion hooks to receive the final uploaded primary file and typed outputs, so that downstream side effects use the final asset state.
18. As a backend developer, I want all configured outputs to succeed or the whole upload to fail, so that the returned result always satisfies the route contract.
19. As a backend developer, I want output keys to follow a convention in the first version, so that the API stays compact.
20. As a backend developer, I want core Uplift to stay free of media dependencies, so that non-media users do not install Sharp or ffmpeg tooling.
21. As a library maintainer, I want image and video packages to be domain packages, so that users install capabilities they understand rather than a vague rich package.
22. As a library maintainer, I want to deprecate the `@uplift-io/rich` concept and remove it from public docs as the recommended path, so that rich inspection does not compete with clearer domain packages.
23. As a SaaS developer, I want synchronous video processing to be clearly documented as deployment-sensitive, so that I can choose appropriate file limits and hosting environments.
24. As a SaaS developer, I want video transforms to ship alongside image transforms, so that I can build both image and video processing products with the same Uplift mental model.
25. As a storage adapter author, I want adapters to remain unaware of transforms and outputs, so that adapters continue to receive prepared files through the existing storage abstraction.
26. As a developer evaluating Uplift, I want the docs and website to show image and video processing clearly, so that I can understand the feature without reading source code.
27. As a library maintainer, I want docs snippets to typecheck with the new packages, so that published examples do not drift from the API.
28. As a library maintainer, I want packaging smoke tests to include image and video packages, so that publish artifacts are verified before release.
29. As a library maintainer, I want CI and release workflows to cover the new media packages, so that releases do not ship unbuilt or untested packages.
30. As a library maintainer, I want bundle/package-size reporting to account for the core staying small and media dependencies living in domain packages, so that dependency boundaries remain visible.

## Implementation Decisions

- Core will add a generic transform contract and a generic output contract.
- Core builders will expose `.transform(...transforms)` and `.outputs(...outputs)`.
- `.transform()` is for primary-file mutation only.
- `.outputs()` is for additional derived files only.
- Image and video processing will be provided through `@uplift-io/image` and `@uplift-io/video`.
- `@uplift-io/image` owns Sharp-backed image processing.
- `@uplift-io/video` owns ffmpeg-backed video processing.
- Core will not import Sharp, ffmpeg, ffprobe, or media-specific libraries.
- The existing `@uplift-io/rich` package is not the preferred long-term public concept for media features.
- `@uplift-io/rich` should be deprecated or treated as legacy, and public docs should recommend domain packages instead.
- Existing core media-inspection builder methods should be removed or deprecated from core, including image dimensions, square, aspect ratio, video duration, audio duration, PDF page count, and PDF encryption checks.
- Core validation remains focused on cheap upload facts such as size, MIME type, and extension.
- There will be no separate `.validate(...)` media pipeline in the first version.
- Media transformers may throw when they cannot process an input, and those failures propagate as upload failures.
- `.key()` will see the final transformed primary file.
- `.meta()` will continue to describe request, user, and original upload context.
- `.done()` and global completion hooks will receive the final uploaded primary file and declared outputs.
- Output names are declared by output functions and preserved as literal types.
- Client results will expose a typed getter for outputs rather than requiring direct access to a loose output record.
- Output files will use convention-based keys in the first version.
- If any primary or output adapter write fails, the upload request fails.
- Video transforms run synchronously during the upload request in the first version.
- Video documentation must clearly explain that synchronous video processing is suitable for controlled file sizes and server environments that can run ffmpeg, not unbounded long-form transcoding workloads.
- Public docs, package READMEs, docs snippets, and the static site must be updated with the new media package model.
- CI must typecheck docs snippets that import `@uplift-io/image` and `@uplift-io/video`.
- Packaging smoke tests must pack and install the new media packages.
- Release workflows must publish the new media packages with the rest of the workspace packages.
- Bundle-size reporting must continue to demonstrate that core Uplift does not include media dependencies.
- The media transforms and outputs release is targeted as `1.1.0`.
- The changelog and release checklist must be updated for `1.1.0`.

## Image Package Surface

Image transforms change the primary image:

- `resize`
- `crop`
- `convert`
- `compress`
- `strip`
- `watermark`
- `blur`
- `grayscale`
- `rotate`
- `autoOrient`
- `sharpen`
- `flatten`
- `trim`

Image outputs create additional files:

- `variant`

The first version should prefer `variant` over many specialized helpers, because it can reuse the same image transforms used by the primary pipeline.

## Video Package Surface

Video transforms change the primary video:

- `trim`
- `transcode`
- `compress`
- `resize`
- `crop`
- `watermark`
- `mute`
- `setFrameRate`

Video outputs create additional files:

- `thumbnail`
- `poster`
- `storyboard`
- `extractAudio`

## Typed DSL Decisions

Media options should use unions, numbers, booleans, and template literal types rather than unbounded strings.

- Video times should support strict clock-time strings and percentage positions.
- Durations should support typed strings such as milliseconds, seconds, minutes, and hours.
- Image formats should be known literal values such as JPEG, PNG, WebP, and AVIF.
- Video formats should be known literal values such as MP4, WebM, and MOV.
- Video codecs should be known literal values such as H.264, H.265, VP9, and AV1.
- Fit modes should be known literal values.
- Watermark positions should be known literal values.
- Output names should use literal-preserving generic types so that declared names flow into client result typing.

## Testing Decisions

- Tests should verify public route behavior, not internal implementation details.
- Type tests should prove that image routes reject video transforms and video routes reject image transforms.
- Type tests should prove that output names flow into the client result type.
- Type tests should prove that undeclared output names cannot be accessed through the typed output getter.
- Type tests should cover timestamp, duration, format, codec, fit mode, and position option types.
- Runtime tests should cover transform order and confirm transforms compose left to right.
- Runtime tests should confirm `.key()` receives post-transform primary file metadata.
- Runtime tests should confirm output files are handed to the configured storage adapter.
- Runtime tests should confirm primary and output adapter write failures fail the whole upload.
- Runtime tests should confirm output key conventions.
- Runtime tests should confirm the frontend upload call shape remains unchanged.
- Image package tests should use deterministic fixtures and assert output metadata and bytes where practical.
- Video package tests should isolate ffmpeg-dependent behavior and make host requirements explicit.
- Storage adapter tests should continue to treat adapters as recipients of prepared files, not media-aware components.
- Docs snippet typechecks should cover image and video route examples.
- Packaging smoke tests should install the packed image and video packages and compile a small consumer app.
- CI should run the same verification path needed before publish.
- Release workflow coverage should be checked after package names and dependency boundaries are final.
- Site updates should be reviewed for API accuracy and consistency with README examples.
- Release-readiness checks should confirm the changelog and directly managed package versions are updated for `1.1.0`.

## Out of Scope

- Background queues, job state, polling, retries, and database-backed media workflows.
- Client-side transform awareness.
- Hosted media infrastructure.
- Arbitrary output key override APIs in the first version.
- A separate media `.validate(...)` pipeline.
- Passive assertion-only transforms in the first version, unless required by implementation constraints.
- Unbounded long-form video transcoding guarantees.
- Exposing Sharp, ffmpeg, or ffprobe through public Uplift core APIs.
- Publishing the media packages without docs, site, smoke-pack, and workflow updates.

## Further Notes

The main product principle is that Uplift remains a typed upload contract. Media processing should feel like route configuration, not like adopting a media infrastructure platform.

The key mental model is:

- Core validates cheap facts about what the user uploaded.
- `.transform()` defines what the primary stored artifact becomes.
- `.outputs()` defines which named extra artifacts are produced.
- The frontend only sees the typed upload result.

This keeps the API small while preserving Uplift's strongest promise: define server behavior once, then get a typed client contract automatically.
