<p align="center">
  <img src="./site/assets/logo.svg" alt="Uplift logo" width="88" height="88" />
</p>

# Uplift

[![npm version](https://img.shields.io/npm/v/@uplift-io/uplift?color=0f766e)](https://www.npmjs.com/package/@uplift-io/uplift)
[![npm downloads](https://img.shields.io/npm/dm/@uplift-io/uplift?color=2563eb)](https://www.npmjs.com/package/@uplift-io/uplift)
[![npm downloads total](https://img.shields.io/npm/dt/@uplift-io/uplift?color=7c3aed)](https://www.npmjs.com/package/@uplift-io/uplift)
[![CI](https://github.com/Itzfeminisce/uplift/actions/workflows/ci.yml/badge.svg)](https://github.com/Itzfeminisce/uplift/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/badge/bundle-measured%20locally-14b8a6)](./docs/BUNDLE_SIZE.md)
[![license](https://img.shields.io/npm/l/@uplift-io/uplift)](./LICENSE)

Dead-simple, type-safe file uploads for TypeScript applications.

Define upload routes once on the server. Get a typed client on the frontend.

```ts
await upload.avatar(file);
await upload.gallery(files);
```

Uplift is for people who want file uploads to feel like a TypeScript contract instead of a pile of multipart parsing, storage SDK calls, auth checks, and duplicated client code.

## Why Uplift?

- **Typed from server to client**: route names, file multiplicity, and return values are inferred.
- **Fluent server API**: `image().max("2mb").auth(...).key(...).done(...)`.
- **Single endpoint**: the client posts to one upload endpoint with a route query.
- **Framework adapters**: Next.js, Hono, Express, Fastify, Elysia, SvelteKit, Remix, TanStack Start, and Nuxt entrypoints.
- **Storage adapters**: S3, R2, Bunny, Cloudinary, local, memory, and UploadThing-compatible storage.
- **No schema lock-in**: JSON validation accepts any `.parse()` schema.
- **Small core**: framework and storage adapters live in separate packages, so users install only what they use.
- **Package hardening**: docs snippets, example app, bundle size, and install smoke checks run before publish.

## Install

Install the core plus the adapters you use:

```bash
pnpm add @uplift-io/uplift @uplift-io/next @uplift-io/s3
```

```bash
npm install @uplift-io/uplift @uplift-io/next @uplift-io/s3
```

```bash
yarn add @uplift-io/uplift @uplift-io/next @uplift-io/s3
```

Other adapters are available as separate packages: `@uplift-io/hono`, `@uplift-io/express`, `@uplift-io/fastify`, `@uplift-io/elysia`, `@uplift-io/sveltekit`, `@uplift-io/remix`, `@uplift-io/tanstack-start`, `@uplift-io/nuxt`, `@uplift-io/local`, `@uplift-io/memory`, `@uplift-io/r2`, `@uplift-io/bunny`, `@uplift-io/cloudinary`, and `@uplift-io/uploadthing`.

Media capability packages are optional: add `@uplift-io/image` for image transforms and variants, and `@uplift-io/video` for synchronous video transforms and derived artifacts.

## Quick Start

### 1. Define server routes

```ts
// uploads.ts
import { csv, image, pdf, uplift } from "@uplift-io/uplift";
import { s3 } from "@uplift-io/s3";

export const uploads = uplift({
  storage: s3({
    bucket: process.env.S3_BUCKET!,
    region: "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!
  }),

  routes: {
    avatar: image()
      .max("2mb")
      .auth(async ({ req }) => {
        return { id: req.headers.get("x-user-id")! };
      })
      .headers(({ user }) => ({
        "Cache-Control": "public, max-age=31536000",
        "Content-Disposition": `inline; filename="${user.id}.png"`
      }))
      .key(({ user }) => `avatars/${user.id}.png`)
      .done(async ({ file, user }) => {
        console.log("avatar uploaded", user.id, file.url);
      }),

    resume: pdf().max("5mb"),

    contacts: csv().columns(["email", "name"], { delimiter: "," }),

    gallery: image()
      .max("8mb")
      .multiple(10)
      .auth(async ({ req }) => {
        return { id: req.headers.get("x-user-id")! };
      })
      .key(({ user, file }) => `gallery/${user.id}/${file.name}`)
      .done(async ({ files }) => {
        console.log(files.map((file) => file.url));
      })
  }
});

export type Uploads = typeof uploads;
```

Routes are single-file by default. Calling `.multiple()` changes:

- the server `done()` context from `{ file }` to `{ files }`
- the client input from `File` to `File[] | FileList`
- the client result from `UploadedFile` to `UploadedFile[]`

### 2. Mount a framework handler

Next.js App Router:

```ts
// app/api/upload/route.ts
import { createNextHandler } from "@uplift-io/next";
import { uploads } from "@/uploads";

export const { HEAD, GET, POST } = createNextHandler(uploads);
```

Hono:

```ts
import { Hono } from "hono";
import { createHonoHandler } from "@uplift-io/hono";
import { uploads } from "./uploads";

const app = new Hono();
app.route("/upload", createHonoHandler(uploads));
```

Express:

```ts
import express from "express";
import { createExpressHandler } from "@uplift-io/express";
import { uploads } from "./uploads";

const app = express();
app.use("/upload", createExpressHandler(uploads));
```

### 3. Create a typed client

```ts
// upload-client.ts
import { createUploadClient } from "@uplift-io/uplift/client";
import type { Uploads } from "./uploads";

export const upload = createUploadClient<Uploads>("/api/upload");
```

```ts
const avatar = await upload.avatar(file);
avatar.url;
avatar.key;

const gallery = await upload.gallery(fileList);
gallery[0].url;
```

The client posts to the configured endpoint with `?route=<routeName>`, so one endpoint can host every route.

Route methods also expose operation controls:

```ts
upload.avatar.abort();
await upload.avatar.retry();

const check = await upload.avatar.preflight(file);
if (check.ok) {
  await check.upload();
}
```

`abort()` only cancels the active attempt for that route method. `retry()` reuses the most recent failed or aborted input while the client instance is alive. `preflight()` sends file facts only, then `check.upload()` uses the same upload machinery as a direct route call.

Server handlers expose the standard HTTP surface:

- `HEAD` returns a bodyless health response.
- `GET` returns the public Route Manifest.
- `POST` handles upload attempts and preflight checks.

Generate OpenAPI from the public manifest with `@uplift-io/openapi`:

```ts
import { createRouteManifest } from "@uplift-io/uplift/server";
import { createOpenApiDocument } from "@uplift-io/openapi";

export const openapi = createOpenApiDocument(createRouteManifest(uploads), {
  path: "/api/upload"
});
```

## React

```tsx
import { useUploads } from "@uplift-io/uplift/react";
import type { Uploads } from "./uploads";

export function AvatarUploader() {
  const upload = useUploads<Uploads>("/api/upload");

  return (
    <input
      type="file"
      accept="image/*"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) void upload.avatar(file);
      }}
    />
  );
}
```

Each route method exposes state:

```ts
upload.avatar.progress;
upload.avatar.isUploading;
upload.avatar.error;
upload.avatar.data;
```

In browsers, Uplift uses XHR for real upload progress. In non-browser or custom-fetch environments, progress is lifecycle-based.

## File Builders

```ts
import {
  any,
  audio,
  csv,
  custom,
  image,
  json,
  pdf,
  text,
  video
} from "@uplift-io/uplift";
```

Shared methods:

```ts
.max("2mb")
.min("10kb")
.multiple(10)
.auth(async ({ req }) => user)
.overrideAuth()
.key(({ user, file }) => `uploads/${file.name}`)
.meta(({ user, file }) => ({ owner: user.id, name: file.name }))
.validate(({ file }) => true)
.headers({ "Cache-Control": "public, max-age=31536000" })
.done(async ({ file, user, meta }) => {})
```

JSON schema validation accepts any object with a `.parse()` method:

```ts
json().schema(zodSchema);
```

`headers()` is shared by every route builder and means object-storage headers. It accepts a static object or a function that can read `req`, `file`, `user`, and `meta`.

CSV file structure uses `columns()`:

```ts
csv().columns(["email", "name"], { delimiter: "," });
csv().delimiter(";").columns(["email", "name"]);
```

If both `columns(..., { delimiter })` and `delimiter()` are used, the last delimiter call wins. Migrate old CSV column checks from `csv().headers([...])` to `csv().columns([...])`.

There is no hard dependency on Zod, Axios, an ORM, or a database client.

## Media Processing

Core Uplift owns the typed pipeline, but media packages own media dependencies and domain APIs. `.transform()` changes the primary uploaded file before key generation and storage. `.outputs()` creates named artifacts after primary transforms have finished.

```ts
import { image, video } from "@uplift-io/uplift";
import { resize, convert, variant } from "@uplift-io/image";
import { trim, transcode, thumbnail, poster } from "@uplift-io/video";

const routes = {
  avatar: image()
    .transform(resize({ width: 512, height: 512, fit: "cover" }), convert("webp"))
    .outputs(
      variant("thumb", resize({ width: 96, height: 96 }), convert("webp")),
      variant("preview", resize({ width: 320 }), convert("webp"))
    ),

  clip: video()
    .transform(trim({ start: "00:00:01", end: "00:00:10" }), transcode({ format: "mp4", codec: "h264" }))
    .outputs(thumbnail("thumb", { at: "25%" }), poster("poster", { at: "00:00:02" }))
};
```

The frontend upload method shape is unchanged:

```ts
const avatar = await upload.avatar(file);
avatar.output("thumb").url;

const clip = await upload.clip(videoFile);
clip.output("poster").url;
```

Output keys use the v1 convention `<primary-key>/outputs/<name>.<extension>`. Outputs derive from the transformed primary file, and any transform, output, `done()`, or `onUploadComplete` failure fails the upload request. Storage adapters can implement `delete(key)` to let core roll back already-written objects during failed requests.

`@uplift-io/image` uses Sharp internally. `@uplift-io/video` shells out to ffmpeg/ffprobe during the upload request; production hosts should install those binaries or set `UPLIFT_FFMPEG_PATH` and `UPLIFT_FFPROBE_PATH`, and should keep request-time budgets appropriate for the selected work.

## Storage

```ts
import { bunny } from "@uplift-io/bunny";
import { cloudinary } from "@uplift-io/cloudinary";
import { local } from "@uplift-io/local";
import { r2 } from "@uplift-io/r2";
import { s3 } from "@uplift-io/s3";
import { uploadthing } from "@uplift-io/uploadthing";
```

S3 and R2 use `@aws-sdk/client-s3` and support safe object headers plus rollback deletion. Bunny supports safe object headers and deletes through Bunny Storage. Local and memory storage implement cleanup. Custom adapters can omit `delete`, but rollback cannot remove files for adapters that do not expose it.

Cloudinary unsigned uploads still work with `cloudName` and `uploadPreset`; rollback cleanup is enabled only when server-side `apiKey` and `apiSecret` are configured. Cloudinary does not provide generic object-storage header parity, so route headers are not mapped there.

The UploadThing adapter accepts a server-side uploader compatible with `UTApi.uploadFiles()` and an optional deleter compatible with `UTApi.deleteFiles()`, keeping UploadThing as an optional integration rather than a core dependency.

```ts
import { uploadthing } from "@uplift-io/uploadthing";
import { UTApi } from "uploadthing/server";

const utapi = new UTApi();

const storage = uploadthing({
  uploader: (file) => utapi.uploadFiles(file),
  deleter: (key) => utapi.deleteFiles(key)
});
```

## Examples

- [Next local example](./examples/next-local): local storage by default, with S3 and R2 configuration paths.
- [Typed docs snippets](./docs/snippets): source samples checked by TypeScript.

Run the dogfood checks:

```bash
pnpm docs:check
pnpm examples:check
pnpm smoke:pack
```

## Bundle Size

Bundle size is generated from the built package, not a remote badge service:

```bash
pnpm build
pnpm bundle:size
```

See [docs/BUNDLE_SIZE.md](./docs/BUNDLE_SIZE.md).

## Legacy Rich Inspection

`@uplift-io/rich` is legacy. Prefer `@uplift-io/image` and `@uplift-io/video` for media behavior. Existing inspection-heavy routes remain opt-in:

```ts
import { audio, pdf, video } from "@uplift-io/rich";

pdf().pages({ max: 10 }).encrypted(false);
video().duration({ max: "2m" });
audio().duration({ max: "5m" });
```

Rich inspection methods currently fail closed until an inspector is wired for the deployment. Video duration checks are designed around ffprobe; hosts using that legacy feature must provide ffprobe and should verify availability in deployment.

## Documentation

- Docs site: [itzfeminisce.github.io/uplift](https://itzfeminisce.github.io/uplift/)
- PRD: [docs/PRD.md](./docs/PRD.md)
- Media transforms PRD: [docs/PRD_MEDIA_TRANSFORMS_AND_OUTPUTS.md](./docs/PRD_MEDIA_TRANSFORMS_AND_OUTPUTS.md)
- Storage headers and rollback: [docs/STORAGE_HEADERS_AND_ROLLBACK.md](./docs/STORAGE_HEADERS_AND_ROLLBACK.md)
- Issue breakdown: [docs/ISSUE_BREAKDOWN.md](./docs/ISSUE_BREAKDOWN.md)
- 1.2.0 checklist: [docs/releases/1.2.0-checklist.md](./docs/releases/1.2.0-checklist.md)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)

## Comparison

Uplift is not trying to replace every upload tool.

- Choose **Uplift** when the upload contract should be typed from server route to client call, and storage should stay swappable.
- Choose **UploadThing** when you want managed upload infrastructure and first-party UI helpers. Uplift can use it as a storage boundary.
- Choose **Uppy** or **FilePond** when the browser upload widget is the product surface.
- Choose **direct SDKs** when you need bespoke storage behavior and do not need route inference.

## Project Status

Uplift is at `1.0.0`. The package split is the stable install model: install `@uplift-io/uplift` for core APIs, then add only the framework and storage adapters your app uses.

## Contributing

Issues and PRs are welcome. Good contributions usually include:

- a small failing test that captures the behavior
- the minimal implementation to make it pass
- docs updates when the public API changes

Run the project locally:

```bash
pnpm install
pnpm check
```

## License

MIT
