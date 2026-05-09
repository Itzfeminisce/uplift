# Uplift

[![npm version](https://img.shields.io/npm/v/uplift?color=0f766e)](https://www.npmjs.com/package/uplift)
[![npm downloads](https://img.shields.io/npm/dm/uplift?color=2563eb)](https://www.npmjs.com/package/uplift)
[![npm downloads total](https://img.shields.io/npm/dt/uplift?color=7c3aed)](https://www.npmjs.com/package/uplift)
[![CI](https://github.com/Itzfeminisce/uplift/actions/workflows/ci.yml/badge.svg)](https://github.com/Itzfeminisce/uplift/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/uplift)](https://github.com/Itzfeminisce/uplift/blob/main/LICENSE)

Dead-simple, type-safe file uploads for TypeScript applications.

Define upload routes once on the server. Get a typed client on the frontend.

```ts
await upload.avatar(file);
await upload.gallery(files);
```

## Install

```bash
pnpm add uplift
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
- GitHub: [github.com/Itzfeminisce/uplift](https://github.com/Itzfeminisce/uplift)
- License: MIT
