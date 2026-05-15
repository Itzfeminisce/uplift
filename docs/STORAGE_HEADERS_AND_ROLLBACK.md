# Storage Headers, CSV Columns, And Rollback

## Storage Headers

`headers()` is shared by every upload builder and configures object-storage headers. It accepts static headers or a function that receives `req`, `file`, `user`, and `meta`.

```ts
image().headers({ "Cache-Control": "public, max-age=31536000" });
```

Supported official adapter behavior:

- S3 and R2 map safe object headers such as `Cache-Control`, `Content-Disposition`, `Content-Encoding`, `Content-Language`, and `Expires`.
- Bunny forwards the same safe object headers while preserving adapter-owned `AccessKey` and `Content-Type`.
- Local, memory, UploadThing, and Cloudinary do not provide generic object-header parity.

## CSV Columns

CSV file structure uses `columns()`.

```ts
csv().columns(["email", "name"]);
csv().columns(["email", "name"], { delimiter: ";" });
csv().delimiter("|").columns(["email", "name"]);
```

Migrate old CSV column checks from `csv().headers([...])` to `csv().columns([...])`. `headers()` now always means storage headers.

## Rollback

If a request fails after writing objects, Uplift attempts to delete every object written during that request. Rollback covers output failures, route `done()` failures, global `onUploadComplete` failures, and multi-file partial failures.

Rollback is best-effort. Delete failures do not replace the original upload error, and custom adapters without `delete(key)` cannot remove already-written objects.

Official cleanup support:

- S3 uses `DeleteObjectCommand`.
- R2 delegates to the S3-compatible adapter.
- Bunny uses the storage file `DELETE` endpoint with `AccessKey`.
- UploadThing calls the configured `deleter`, usually `UTApi.deleteFiles`.
- Cloudinary cleanup is available when `apiKey` and `apiSecret` are configured; unsigned uploads still work without cleanup credentials.
