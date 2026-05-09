# Uplift Next Local Example

This dogfoods Uplift before npm publishing with a real app-shaped setup:

- typed upload routes in `src/uploads.ts`
- a Next App Router handler at `app/api/upload/route.ts`
- a browser client call from `app/page.tsx`
- local, S3, and R2 configuration paths

Run the type-level smoke check:

```bash
pnpm --filter @uplift/example-next-local typecheck
```

Copy `.env.example` values into your app environment. Local storage is the default for development. Set `UPLIFT_STORAGE=s3` or `UPLIFT_STORAGE=r2` to test cloud storage with real credentials.
