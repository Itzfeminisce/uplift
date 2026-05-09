# Uplift

Dead-simple, type-safe file handling for TypeScript applications.

Uplift lets you define upload routes on the server and use those same routes as a typed client contract on the frontend.

```ts
await upload.avatar(file);
await upload.gallery(files);
```

## Server Routes

```ts
import { image, pdf, uplift } from "uplift";
import { bunny } from "uplift/storage/bunny";

export const uploads = uplift({
  storage: bunny({
    apiKey: process.env.BUNNY_API_KEY!,
    zone: process.env.BUNNY_ZONE!
  }),
  middleware: async ({ req }) => ({ id: req.headers.get("x-user-id")! }),
  routes: {
    avatar: image()
      .max("2mb")
      .key(({ user }) => `avatars/${user.id}.png`)
      .done(async ({ file, user }) => {
        console.log(user.id, file.url);
      }),
    resume: pdf().max("5mb"),
    gallery: image()
      .max("8mb")
      .multiple(10)
      .key(({ user, file }) => `gallery/${user.id}/${file.name}`)
      .done(async ({ files }) => {
        console.log(files.map((file) => file.url));
      })
  }
});

export type Uploads = typeof uploads;
```

Routes are single-file by default. Calling `.multiple()` changes the server `done()` context, the client input type, and the client result type.

## Client

```ts
import { createUploadClient } from "uplift/client";
import type { Uploads } from "./uploads";

export const upload = createUploadClient<Uploads>("/upload");

const avatar = await upload.avatar(file);
const gallery = await upload.gallery(fileList);
```

## React

```tsx
import { useUploads } from "uplift/react";
import type { Uploads } from "./uploads";

export function AvatarUploader() {
  const upload = useUploads<Uploads>("/upload");

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

Each route method also exposes state:

```ts
upload.avatar.progress;
upload.avatar.isUploading;
upload.avatar.error;
upload.avatar.data;
```

## Framework Handlers

The client posts to the configured endpoint with `?route=<routeName>`, so a single framework endpoint can host every upload route.

```ts
import { createNextHandler } from "uplift/next";
import { uploads } from "./uploads";

export const { GET, POST } = createNextHandler(uploads);
```

```ts
import { Hono } from "hono";
import { createHonoHandler } from "uplift/hono";
import { uploads } from "./uploads";

const app = new Hono();
app.route("/upload", createHonoHandler(uploads));
```

```ts
import express from "express";
import { createExpressHandler } from "uplift/express";
import { uploads } from "./uploads";

const app = express();
app.use("/upload", createExpressHandler(uploads));
```

## Storage

```ts
import { bunny } from "uplift/storage/bunny";
import { cloudinary } from "uplift/storage/cloudinary";
import { local } from "uplift/storage/local";
import { r2 } from "uplift/storage/r2";
import { s3 } from "uplift/storage/s3";
```

S3 and R2 share an S3-compatible shape. Bunny, Cloudinary, and local storage are thin adapters over the same storage contract.

## Rich Inspection

Core stays lean. Inspection-heavy routes are opt-in:

```ts
import { audio, pdf, video } from "uplift/rich";

pdf().pages({ max: 10 }).encrypted(false);
video().duration({ max: "2m" });
audio().duration({ max: "5m" });
```

Rich inspection methods fail closed until an inspector is wired for the deployment. Video duration checks are designed around ffprobe; hosts using that feature must provide ffprobe and should verify availability in deployment.

## Validation

JSON schema validation accepts any object with a `.parse()` method:

```ts
json().schema(zodSchema);
```

There is no hard dependency on Zod, Axios, an ORM, or a database client.
