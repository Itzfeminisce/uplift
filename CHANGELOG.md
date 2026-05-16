# Changelog

## 1.4.0

### Async Transforms

- Added async transform routes with `.transformAsync(...)`, root `asyncTransforms` guardrails, `AsyncTransformHandle`, polling `transform.done()`, and worker/status exports.
- Added Transform Job lifecycle state, Original Upload cleanup policy via `keepOriginal`, typed completed outputs, best-effort route listeners, and React route `status` support.
- Documented request-time transforms versus background Transform Jobs across docs snippets, package docs, and the static site.

## 1.2.0

### Storage Headers, CSV Columns, And Rollback

- Added shared route `headers()` support for object-storage headers across upload builders, including dynamic headers from request, file, user, and metadata context.
- Renamed CSV column validation from `csv().headers([...])` to `csv().columns([...])`; `headers()` now consistently means storage headers.
- Added request rollback tracking so output, route `done()`, and global `onUploadComplete` failures attempt to delete every object written during the failed request.
- Added S3, R2, Bunny, UploadThing, and Cloudinary cleanup support, with Cloudinary signed cleanup enabled by server-side API key and API secret.
- Documented safe adapter header behavior, CSV migration, rollback limitations for custom adapters without `delete`, and Cloudinary unsigned upload versus signed cleanup credentials.

## 1.1.0

### Media Transforms And Outputs

- Added core `.transform()` support for primary upload file transforms before key generation and storage.
- Added core `.outputs()` support for named derived files, convention-based output keys, and typed client `uploaded.output("name")` access.
- Added `@uplift-io/image` with typed image transforms: `resize`, `convert`, `compress`, `strip`, and `variant` outputs.
- Added `@uplift-io/video` with typed synchronous video transforms and outputs: `trim`, `transcode`, `compress`, `resize`, `crop`, `watermark`, `mute`, `frameRate`, `thumbnail`, `poster`, `storyboard`, and `extractAudio`.
- Kept media processing dependencies outside core; `@uplift-io/uplift` remains the small typed route and client package.
- Updated docs snippets, package smoke checks, and the static site for media processing.
- Repositioned `@uplift-io/rich` as legacy inspection surface; domain packages are the recommended path for image and video behavior.

## 1.0.0

### Package Split

- Published core as `@uplift-io/uplift`.
- Moved framework adapters to dedicated packages: `@uplift-io/next`, `@uplift-io/hono`, and `@uplift-io/express`.
- Moved storage adapters to dedicated packages: `@uplift-io/s3`, `@uplift-io/r2`, `@uplift-io/bunny`, `@uplift-io/cloudinary`, `@uplift-io/local`, `@uplift-io/memory`, and `@uplift-io/uploadthing`.
- Moved rich builders to `@uplift-io/rich`.
- Added `@uplift-io/uplift/server` for framework adapters and server runtimes.

### Dependency Isolation

- Removed adapter dependencies from core. Installing `@uplift-io/uplift` no longer installs Hono or the AWS S3 SDK.
- `@uplift-io/hono` owns the `hono` dependency.
- `@uplift-io/s3` owns `@aws-sdk/client-s3`.
- `@uplift-io/r2` composes `@uplift-io/s3`.
- Local, memory, Bunny, Cloudinary, and UploadThing adapters depend only on core unless their own runtime needs more.

### Migration From 0.1.x

Before:

```ts
import { image, uplift } from "uplift-io";
import { createNextHandler } from "uplift-io/next";
import { s3 } from "uplift-io/storage/s3";
```

After:

```ts
import { image, uplift } from "@uplift-io/uplift";
import { createNextHandler } from "@uplift-io/next";
import { s3 } from "@uplift-io/s3";
```

Install only the packages your app uses:

```bash
pnpm add @uplift-io/uplift @uplift-io/next @uplift-io/s3
```

### Tooling

- Updated docs snippets, the Next local example, and package-boundary tests to use public scoped package imports.
- Updated package smoke tests to pack and install multiple scoped packages together.
- Added a manual release workflow that runs checks before publishing scoped packages.
