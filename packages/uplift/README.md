# Uplift

[![npm version](https://img.shields.io/npm/v/@uplift-io/uplift?color=0f766e)](https://www.npmjs.com/package/@uplift-io/uplift)
[![npm downloads](https://img.shields.io/npm/dm/@uplift-io/uplift?color=2563eb)](https://www.npmjs.com/package/@uplift-io/uplift)
[![npm downloads total](https://img.shields.io/npm/dt/@uplift-io/uplift?color=7c3aed)](https://www.npmjs.com/package/@uplift-io/uplift)
[![CI](https://github.com/Itzfeminisce/uplift/actions/workflows/ci.yml/badge.svg)](https://github.com/Itzfeminisce/uplift/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/badge/bundle-measured%20locally-14b8a6)](https://github.com/Itzfeminisce/uplift/blob/main/docs/BUNDLE_SIZE.md)
[![license](https://img.shields.io/npm/l/@uplift-io/uplift)](https://github.com/Itzfeminisce/uplift/blob/main/LICENSE)

Dead-simple, type-safe file uploads for TypeScript applications.

Define upload routes once on the server. Get a typed client on the frontend.

```ts
await upload.avatar(file);
await upload.gallery(files);
```

## Install

Install core plus the adapters you use:

```bash
pnpm add @uplift-io/uplift @uplift-io/next @uplift-io/s3
```

## Quick Start

```ts
import { csv, image, uplift } from "@uplift-io/uplift";
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
      .auth(async ({ req }) => ({ id: req.headers.get("x-user-id")! }))
      .headers({ "Cache-Control": "public, max-age=31536000" })
      .key(({ user }) => `avatars/${user.id}.png`)
      .done(async ({ file }) => {
        console.log(file.url);
      }),
    contacts: csv().columns(["email", "name"]),
    gallery: image().max("8mb").multiple(10)
  }
});

export type Uploads = typeof uploads;
```

```ts
import { createUploadClient } from "@uplift-io/uplift/client";
import type { Uploads } from "./uploads";

export const upload = createUploadClient<Uploads>("/api/upload");

const avatar = await upload.avatar(file);
const gallery = await upload.gallery(fileList);
```

## Media Transforms

Core exports the typed `.transform()` and `.outputs()` pipeline, while optional domain packages own media behavior and dependencies:

```ts
import { image } from "@uplift-io/uplift";
import { resize, convert, variant } from "@uplift-io/image";

const avatar = image()
  .transform(resize({ width: 512, height: 512 }), convert("webp"))
  .outputs(variant("thumb", resize({ width: 96 }), convert("webp")));
```

The frontend call remains `upload.avatar(file)`. Declared outputs are available with `uploaded.output("thumb")`.

Core stays free of Sharp and ffmpeg. Media packages own those runtime dependencies, and storage adapters may implement `delete(key)` so core can roll back already-written files when a later request step fails.

## Storage Headers, CSV Columns, And Rollback

`headers()` is shared by every builder and means object-storage headers:

```ts
image().headers({ "Cache-Control": "public, max-age=31536000" });
```

CSV file validation uses `columns()`:

```ts
csv().columns(["email", "name"], { delimiter: "," });
```

Migrate old CSV `headers([...])` calls to `columns([...])`. If a request fails after writing storage objects, core attempts best-effort rollback through the adapter's optional `delete(key)`.

## More

- Full docs: [itzfeminisce.github.io/uplift](https://itzfeminisce.github.io/uplift/)
- Bundle size report: [docs/BUNDLE_SIZE.md](https://github.com/Itzfeminisce/uplift/blob/main/docs/BUNDLE_SIZE.md)
- Next local example: [examples/next-local](https://github.com/Itzfeminisce/uplift/tree/main/examples/next-local)
- GitHub: [github.com/Itzfeminisce/uplift](https://github.com/Itzfeminisce/uplift)
- License: MIT

## Storage

Uplift publishes S3, R2, Bunny, Cloudinary, local, memory, and UploadThing-compatible adapters as separate packages. The UploadThing adapter accepts a server-side uploader compatible with `UTApi.uploadFiles()` and keeps UploadThing optional:

```ts
import { uploadthing } from "@uplift-io/uploadthing";
import { UTApi } from "uploadthing/server";

const utapi = new UTApi();
const storage = uploadthing({
  uploader: (file) => utapi.uploadFiles(file),
  deleter: (key) => utapi.deleteFiles(key)
});
```
