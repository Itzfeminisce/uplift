# Changelog

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
