# Uplift Next Local Example

This dogfoods Uplift before npm publishing with a real app-shaped setup:

- typed upload routes in `src/uploads.ts`
- a Next App Router handler at `app/api/upload/route.ts`
- browser uploads from `app/page.tsx` using `useUploads`
- image transforms with typed `thumb` and `preview` outputs
- async video transforms with typed `thumb` output
- local, S3, and R2 configuration paths

## Local Development

Local storage is the default. Uploaded files are written under `public/uploads`, and the returned URLs use `/uploads/...`, so image and video results render immediately in the page.

The example routes:

- `avatar`: single image upload with auth-derived key generation
- `gallery`: multi-image upload returning `UploadedFile[]`
- `mediaPreview`: image transform pipeline with `uploaded.output("thumb")` and `uploaded.output("preview")`
- `clip`: async video transform pipeline with `transform.done()` and `uploaded.output("thumb")`

Run the type-level smoke check:

```bash
pnpm --filter @uplift-io/example-next-local typecheck
```

Copy `.env.example` values into your app environment when you want to override defaults. Set `UPLIFT_STORAGE=s3` or `UPLIFT_STORAGE=r2` to test cloud storage with real credentials.
