# Uplift

[![npm version](https://img.shields.io/npm/v/uplift-io?color=0f766e)](https://www.npmjs.com/package/uplift-io)
[![npm downloads](https://img.shields.io/npm/dm/uplift-io?color=2563eb)](https://www.npmjs.com/package/uplift-io)
[![npm downloads total](https://img.shields.io/npm/dt/uplift-io?color=7c3aed)](https://www.npmjs.com/package/uplift-io)
[![CI](https://github.com/Itzfeminisce/uplift/actions/workflows/ci.yml/badge.svg)](https://github.com/Itzfeminisce/uplift/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/badge/bundle-measured%20locally-14b8a6)](https://github.com/Itzfeminisce/uplift/blob/main/docs/BUNDLE_SIZE.md)
[![license](https://img.shields.io/npm/l/uplift)](https://github.com/Itzfeminisce/uplift/blob/main/LICENSE)

Dead-simple, type-safe file uploads for TypeScript applications.

Define upload routes once on the server. Get a typed client on the frontend.

```ts
await upload.avatar(file);
await upload.gallery(files);
```

## Install

```bash
pnpm add uplift-io
```

## Quick Start

```ts
import { image, uplift } from "uplift";
import { s3 } from "uplift/storage/s3";

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
      .key(({ user }) => `avatars/${user.id}.png`)
      .done(async ({ file }) => {
        console.log(file.url);
      }),
    gallery: image().max("8mb").multiple(10)
  }
});

export type Uploads = typeof uploads;
```

```ts
import { createUploadClient } from "uplift/client";
import type { Uploads } from "./uploads";

export const upload = createUploadClient<Uploads>("/api/upload");

const avatar = await upload.avatar(file);
const gallery = await upload.gallery(fileList);
```

## More

- Full docs: [itzfeminisce.github.io/uplift](https://itzfeminisce.github.io/uplift/)
- Bundle size report: [docs/BUNDLE_SIZE.md](https://github.com/Itzfeminisce/uplift/blob/main/docs/BUNDLE_SIZE.md)
- Next local example: [examples/next-local](https://github.com/Itzfeminisce/uplift/tree/main/examples/next-local)
- GitHub: [github.com/Itzfeminisce/uplift](https://github.com/Itzfeminisce/uplift)
- License: MIT

## Storage

Uplift includes S3, R2, Bunny, Cloudinary, local, memory, and UploadThing-compatible adapters. The UploadThing adapter accepts a server-side uploader compatible with `UTApi.uploadFiles()` and keeps UploadThing optional:

```ts
import { uploadthing } from "uplift/storage/uploadthing";
import { UTApi } from "uploadthing/server";

const utapi = new UTApi();
const storage = uploadthing({
  uploader: (file) => utapi.uploadFiles(file)
});
```
