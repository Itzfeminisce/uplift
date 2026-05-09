# Uplift Issue Breakdown

This draft follows the `to-issues` tracer-bullet workflow. Each slice should be independently verifiable and preferably AFK unless a product or architecture decision needs human review.

## Proposed Slices

1. **Type inference tracer bullet**
   - Type: AFK
   - Blocked by: None
   - User stories covered: 1, 2, 3, 4, 5, 6, 7, 12, 37, 42
   - What to build: Prove the fluent builder type model with single-file and multi-file routes, including `done()` context narrowing and route-to-client type inference.

2. **Core route config and validation runtime**
   - Type: AFK
   - Blocked by: Type inference tracer bullet
   - User stories covered: 8, 9, 10, 11, 13, 16, 17, 18, 19, 21, 23, 24, 25, 26, 27
   - What to build: Materialize route definitions into runtime config and validate file size, type, schema, metadata, auth, and custom validation behavior.

3. **Framework-neutral multipart upload pipeline**
   - Type: AFK
   - Blocked by: Core route config and validation runtime
   - User stories covered: 14, 15, 16, 17, 36
   - What to build: Accept multipart upload requests, parse files with busboy, run route validation, store files through a storage adapter contract, and invoke route/global completion hooks.

4. **Typed vanilla upload client**
   - Type: AFK
   - Blocked by: Type inference tracer bullet, Framework-neutral multipart upload pipeline
   - User stories covered: 2, 3, 4, 5, 16, 17
   - What to build: Provide `createUploadClient()` that exposes route-named methods with typed inputs, typed results, upload errors, and progress support.

5. **Next.js, Hono, and Express handler adapters**
   - Type: AFK
   - Blocked by: Framework-neutral multipart upload pipeline
   - User stories covered: 28, 29, 30
   - What to build: Wrap the framework-neutral upload pipeline in adapters for Next.js, Hono, and Express with consistent request/response behavior.

6. **React hook over vanilla client**
   - Type: AFK
   - Blocked by: Typed vanilla upload client
   - User stories covered: 31, 32
   - What to build: Implement `useUploads()` as a thin typed state layer over the vanilla client, exposing route methods plus progress, loading, error, and last data state.

7. **Storage adapter set**
   - Type: AFK
   - Blocked by: Framework-neutral multipart upload pipeline
   - User stories covered: 33, 34, 35
   - What to build: Implement thin S3, R2, Bunny, Cloudinary, and local adapters behind the storage contract without leaking provider dependencies into core.

8. **Rich inspection package**
   - Type: AFK
   - Blocked by: Core route config and validation runtime
   - User stories covered: 20, 22
   - What to build: Add `uplift/rich` builders for PDF page/encryption checks and audio/video duration checks while keeping inspection dependencies out of core.

9. **Package, release, and export setup**
   - Type: AFK
   - Blocked by: Type inference tracer bullet
   - User stories covered: 38, 39, 40, 41
   - What to build: Set up workspace package boundaries, strict TS config, tsup builds, vitest commands, changesets, and public subpath exports.

10. **Developer-facing examples and docs**
    - Type: HITL
    - Blocked by: Typed vanilla upload client, Next.js/Hono/Express adapters, React hook over vanilla client, Storage adapter set
    - User stories covered: 28, 29, 30, 31, 33, 34, 42
    - What to build: Add concise examples and docs for server routes, typed clients, React usage, storage providers, rich inspection, and host requirements.

## Questions Before Filing GitHub Issues

1. Does this granularity feel right, or should any slices be merged or split?
2. Are the dependency relationships correct?
3. Should the docs/examples slice be HITL, or can it be AFK once implementation exists?
4. Should package/release setup happen before the type tracer bullet, or is it fine as a follow-up once the type model is proven?

## Draft Issue Bodies

### 1. Type inference tracer bullet

## What to build

Prove the fluent builder type model with single-file and multi-file routes. A route without `.multiple()` should infer single-file client input, single-file client output, and a `done()` context containing `file`. A route with `.multiple()` should infer `File[] | FileList` client input, array output, and a `done()` context containing `files`.

## Acceptance criteria

- [ ] Single-file routes expose client methods that accept `File` and return `Promise<UploadedFile>`.
- [ ] Multi-file routes expose client methods that accept `File[] | FileList` and return `Promise<UploadedFile[]>`.
- [ ] `done()` context narrows to `{ file }` for single routes and `{ files }` for multi routes.
- [ ] Auth and metadata generic types propagate into key, validate, and done handlers.
- [ ] Type tests fail when single and multi route APIs are misused.

## Blocked by

None - can start immediately.

### 2. Core route config and validation runtime

## What to build

Materialize fluent route builders into runtime route configuration and validate uploaded file metadata before storage. This includes size constraints, file type constraints, schema parsing, auth behavior, server-derived metadata, custom validation, and typed upload errors.

## Acceptance criteria

- [ ] Route builders produce runtime config without exposing internal implementation details.
- [ ] Size, extension/MIME, schema, and custom validation failures return stable `UploadError` codes.
- [ ] Router-level middleware, route-level `.auth()`, and `.overrideAuth()` behavior are covered.
- [ ] Server-derived metadata is available to key, validate, and done handlers.
- [ ] Core has no hard Zod, Axios, ORM, or storage-provider dependency.

## Blocked by

Blocked by issue 1.

### 3. Framework-neutral multipart upload pipeline

## What to build

Create the framework-neutral server pipeline that accepts multipart upload requests, parses files with busboy, validates route rules, writes files through a storage adapter contract, and runs route/global completion hooks.

## Acceptance criteria

- [ ] Multipart uploads are parsed with busboy.
- [ ] Single and multi route limits are enforced at runtime.
- [ ] Successful uploads return `UploadedFile` or `UploadedFile[]` according to route multiplicity.
- [ ] `done()` and `onUploadComplete` fire only after successful storage.
- [ ] Auth, validation, parsing, storage, and unknown failures map to stable `UploadError` codes.

## Blocked by

Blocked by issue 2.

### 4. Typed vanilla upload client

## What to build

Provide `createUploadClient()` that exposes route-named upload methods inferred from the server contract. The client should submit files to the upload endpoint, report progress where possible, and surface typed upload errors.

## Acceptance criteria

- [ ] Client method names are inferred from route names.
- [ ] Client inputs and outputs reflect route multiplicity.
- [ ] Upload failures are thrown as `UploadError` values.
- [ ] The client works without React.
- [ ] Progress reporting is available for consumers such as `uplift/react`.

## Blocked by

Blocked by issues 1 and 3.

### 5. Next.js, Hono, and Express handler adapters

## What to build

Wrap the framework-neutral upload pipeline in handlers for Next.js, Hono, and Express so developers can mount Uplift in common TypeScript server environments.

## Acceptance criteria

- [ ] Next.js App Router exposes `GET` and `POST` handlers through `createNextHandler()`.
- [ ] Hono apps can mount handlers through `createHonoHandler()`.
- [ ] Express apps can mount middleware through `createExpressHandler()`.
- [ ] All adapters share consistent success and error response shapes.
- [ ] Adapter tests exercise behavior through realistic framework request objects where practical.

## Blocked by

Blocked by issue 3.

### 6. React hook over vanilla client

## What to build

Implement `useUploads()` as a typed React state layer over the vanilla upload client. Each route method should expose upload state including progress, `isUploading`, `error`, and last successful `data`.

## Acceptance criteria

- [ ] Hook route methods preserve the same typed inputs and outputs as the vanilla client.
- [ ] Each route exposes `progress`, `isUploading`, `error`, and `data`.
- [ ] State updates correctly on success, failure, and repeated uploads.
- [ ] The package does not introduce Zustand, React Query, or other state manager dependencies.

## Blocked by

Blocked by issue 4.

### 7. Storage adapter set

## What to build

Implement storage adapters for S3, R2, Bunny, Cloudinary, and local filesystem storage behind a small storage contract. Provider-specific configuration and dependencies should remain isolated to adapter packages.

## Acceptance criteria

- [ ] S3 adapter stores files with `@aws-sdk/client-s3`.
- [ ] R2 adapter uses S3-compatible storage with R2 endpoint configuration.
- [ ] Bunny, Cloudinary, and local adapters implement the same storage contract.
- [ ] Adapter outputs populate the stable `UploadedFile` shape.
- [ ] Core does not import provider SDKs.

## Blocked by

Blocked by issue 3.

### 8. Rich inspection package

## What to build

Add `uplift/rich` builders for inspection-heavy validations while keeping those dependencies outside core. Rich PDF routes should support page count and encryption checks. Rich audio/video routes should support duration checks, with video clearly documenting ffprobe requirements.

## Acceptance criteria

- [ ] `uplift/rich` exports rich PDF, audio, and video builders.
- [ ] PDF page count and encryption checks are available only from rich PDF routes.
- [ ] Audio duration validation is available only from rich audio routes.
- [ ] Video duration validation is available only from rich video routes.
- [ ] ffprobe host requirements are documented and tests mock or skip host-dependent execution when unavailable.

## Blocked by

Blocked by issue 2.

### 9. Package, release, and export setup

## What to build

Set up the monorepo package structure and release tooling needed for Uplift's public package shape, including strict TypeScript, tsup builds, vitest commands, changesets, and subpath exports.

## Acceptance criteria

- [ ] Workspace packages are split by dependency surface.
- [ ] Strict TypeScript configuration is enabled.
- [ ] tsup builds ESM and CJS outputs.
- [ ] vitest can run package tests.
- [ ] changesets is configured for multi-package versioning.
- [ ] Public exports support the intended subpaths.

## Blocked by

Blocked by issue 1.

### 10. Developer-facing examples and docs

## What to build

Add concise examples and documentation that show Uplift's intended mental model, server route definitions, typed client usage, React usage, framework handlers, storage providers, rich inspection, and known host requirements.

## Acceptance criteria

- [ ] Docs show the core `image().max().auth().key().done()` flow.
- [ ] Docs show typed client examples for single and multi-file routes.
- [ ] Docs show Next.js, Hono, and Express setup.
- [ ] Docs show React hook usage and route state.
- [ ] Docs show S3, R2, Bunny, Cloudinary, and local storage setup.
- [ ] Docs clearly explain `uplift/rich` and ffprobe requirements.

## Blocked by

Blocked by issues 4, 5, 6, and 7.
