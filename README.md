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
- **Framework adapters**: Next.js, Hono, and Express entrypoints.
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

Other adapters are available as separate packages: `@uplift-io/hono`, `@uplift-io/express`, `@uplift-io/local`, `@uplift-io/memory`, `@uplift-io/r2`, `@uplift-io/bunny`, `@uplift-io/cloudinary`, `@uplift-io/uploadthing`, and `@uplift-io/rich`.

## Quick Start

### 1. Define server routes

```ts
// uploads.ts
import { image, pdf, uplift } from "@uplift-io/uplift";
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
      .key(({ user }) => `avatars/${user.id}.png`)
      .done(async ({ file, user }) => {
        console.log("avatar uploaded", user.id, file.url);
      }),

    resume: pdf().max("5mb"),

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

export const { GET, POST } = createNextHandler(uploads);
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
.done(async ({ file, user, meta }) => {})
```

JSON schema validation accepts any object with a `.parse()` method:

```ts
json().schema(zodSchema);
```

There is no hard dependency on Zod, Axios, an ORM, or a database client.

## Storage

```ts
import { bunny } from "@uplift-io/bunny";
import { cloudinary } from "@uplift-io/cloudinary";
import { local } from "@uplift-io/local";
import { r2 } from "@uplift-io/r2";
import { s3 } from "@uplift-io/s3";
import { uploadthing } from "@uplift-io/uploadthing";
```

S3 and R2 use `@aws-sdk/client-s3`. Bunny and Cloudinary perform provider uploads with `fetch`. Local storage writes to disk. The UploadThing adapter accepts a server-side uploader compatible with `UTApi.uploadFiles()`, keeping UploadThing as an optional integration rather than a core dependency.

```ts
import { uploadthing } from "@uplift-io/uploadthing";
import { UTApi } from "uploadthing/server";

const utapi = new UTApi();

const storage = uploadthing({
  uploader: (file) => utapi.uploadFiles(file)
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

## Rich Inspection

Inspection-heavy routes are opt-in:

```ts
import { audio, pdf, video } from "@uplift-io/rich";

pdf().pages({ max: 10 }).encrypted(false);
video().duration({ max: "2m" });
audio().duration({ max: "5m" });
```

Rich inspection methods currently fail closed until an inspector is wired for the deployment. Video duration checks are designed around ffprobe; hosts using that feature must provide ffprobe and should verify availability in deployment.

## Documentation

- Docs site: [itzfeminisce.github.io/uplift](https://itzfeminisce.github.io/uplift/)
- PRD: [docs/PRD.md](./docs/PRD.md)
- Issue breakdown: [docs/ISSUE_BREAKDOWN.md](./docs/ISSUE_BREAKDOWN.md)
- 1.0.0 checklist: [docs/releases/1.0.0-checklist.md](./docs/releases/1.0.0-checklist.md)
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
