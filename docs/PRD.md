# Uplift PRD

## Problem Statement

TypeScript developers need a small, obvious way to define upload routes on the server and get a fully typed upload client on the frontend. Today, file upload stacks often force developers to stitch together multipart parsing, storage providers, auth, validation, callbacks, and client methods by hand. That creates duplicated route knowledge, weak type safety, runtime-only mistakes, and framework-specific glue.

Uplift should make uploads feel like a typed contract: define route behavior once on the server, then call route-named upload methods from the client with correct input and output types.

## Solution

Uplift is a TypeScript-first file handling library centered on a fluent builder API. Developers define upload routes with file type builders such as `image()`, `pdf()`, `video()`, `audio()`, `text()`, `json()`, `csv()`, `custom()`, and `any()`. Each route can declare size limits, file constraints, auth behavior, server-derived metadata, storage keys, custom validation, and completion callbacks.

The server contract powers a typed client where single-file routes accept `File` and return `UploadedFile`, while `.multiple()` routes accept `File[] | FileList` and return `UploadedFile[]`. Framework handlers expose the contract in Next.js, Hono, and Express. Storage adapters keep provider concerns isolated, and inspection-heavy PDF/audio/video features live behind `uplift/rich` so the default install remains lean.

## User Stories

1. As a TypeScript application developer, I want to define upload routes once, so that my server and client stay in sync.
2. As a frontend developer, I want `upload.avatar(file)` to be typed from the server route, so that I do not manually maintain upload client methods.
3. As a frontend developer, I want `.multiple()` routes to accept `File[]` and `FileList`, so that browser file inputs work naturally.
4. As a frontend developer, I want single-file routes to reject arrays at compile time, so that route misuse is caught before runtime.
5. As a frontend developer, I want multi-file routes to return `UploadedFile[]`, so that result handling matches route behavior.
6. As a backend developer, I want `done()` context to expose `file` for single routes and `files` for multi routes, so that completion logic is correctly typed.
7. As a backend developer, I want route-level auth to infer the user type, so that downstream handlers can safely use authenticated user data.
8. As a backend developer, I want router-level middleware, so that common auth can be applied to every route.
9. As a backend developer, I want per-route `.auth()`, so that specific routes can override global auth.
10. As a backend developer, I want `.overrideAuth()`, so that a route can be explicitly public.
11. As a backend developer, I want `.key()` to receive request, user, metadata, and file context, so that storage keys can be deterministic and app-specific.
12. As a backend developer, I want `.meta()` to derive metadata server-side, so that client-supplied metadata cannot be trusted accidentally.
13. As a backend developer, I want `.validate()` to return true, an error message, or throw, so that custom validation is ergonomic.
14. As a backend developer, I want `.done()` to run after successful storage, so that database updates, audit logs, and side effects can happen in app code.
15. As a backend developer, I want `onUploadComplete`, so that cross-route audit, logging, and billing hooks can be centralized.
16. As a developer, I want a stable `UploadedFile` shape, so that downstream application code can rely on url, key, name, type, size, extension, and provider.
17. As a developer, I want typed `UploadError` codes, so that UI and server behavior can distinguish common failure modes.
18. As a developer, I want image-specific constraints, so that image uploads can enforce extensions, dimensions, square shape, and aspect ratio.
19. As a developer, I want PDF routes, so that document uploads can be constrained without custom MIME logic.
20. As a developer, I want rich PDF inspection behind `uplift/rich`, so that page count and encryption checks are available only when needed.
21. As a developer, I want video and audio routes, so that media uploads can enforce supported extensions.
22. As a developer, I want rich media duration checks behind `uplift/rich`, so that ffprobe-dependent features do not bloat core.
23. As a developer, I want text routes to validate extension and encoding, so that plain text uploads are explicit.
24. As a developer, I want JSON routes to accept any schema with `.parse()`, so that Zod, Valibot, or other validators can be used without a hard dependency.
25. As a developer, I want CSV routes to validate headers and delimiters, so that imports can fail early.
26. As a developer, I want custom MIME routes, so that exact application-specific file types are supported.
27. As a developer, I want unrestricted `any()` routes, so that generic attachments are possible when appropriate.
28. As a Next.js developer, I want `createNextHandler()`, so that App Router upload endpoints are easy to wire.
29. As a Hono developer, I want `createHonoHandler()`, so that Uplift can mount cleanly in Hono apps.
30. As an Express developer, I want `createExpressHandler()`, so that existing Express apps can adopt Uplift.
31. As a React developer, I want `useUploads()`, so that upload progress, loading state, errors, and last data are easy to render.
32. As a React developer, I want the hook to avoid heavy state dependencies, so that `uplift/react` stays thin and predictable.
33. As a library consumer, I want S3 and R2 storage adapters, so that AWS-compatible object storage works with one adapter shape.
34. As a library consumer, I want Bunny, Cloudinary, and local storage adapters, so that common deployment targets are supported.
35. As a library maintainer, I want each storage adapter isolated, so that provider dependencies do not leak into core installs.
36. As a library maintainer, I want multipart parsing to use busboy, so that stream parsing is battle-tested and framework-neutral.
37. As a library maintainer, I want strict TypeScript from day one, so that the compiler protects the primary value proposition.
38. As a library maintainer, I want tsup builds, so that packages emit clean ESM and CJS outputs with subpath exports.
39. As a library maintainer, I want vitest coverage, so that type behavior and runtime behavior can be verified quickly.
40. As a library maintainer, I want pnpm workspaces, so that core, React, rich inspection, framework handlers, and storage adapters can have separate dependency surfaces.
41. As a library maintainer, I want changesets, so that multi-package releases and changelogs are manageable.
42. As a developer evaluating Uplift, I want examples that can be understood in seconds, so that the API feels smaller than the problem it solves.

## Implementation Decisions

- Use TypeScript in strict mode as a primary correctness surface.
- Use a pnpm workspace monorepo with one package per public subpath or dependency surface.
- Use tsup for package builds with ESM and CJS outputs.
- Use vitest for runtime tests and type-focused tests where appropriate.
- Use changesets for versioning and changelog management.
- Treat builder type inference as the first technical risk to prototype.
- Model route multiplicity with a phantom type on the builder so `done()` context, client input, and client output narrow correctly.
- Keep core free of Zod, Axios, ORM, and database dependencies.
- Represent JSON schema validation through a minimal `StandardSchema` contract with `.parse()`.
- Keep React support dependency-light, implemented as state over the vanilla client.
- Use busboy directly for multipart parsing.
- Keep storage adapters thin and isolated from core.
- Use `@aws-sdk/client-s3` for S3 and R2, with R2 using S3-compatible configuration.
- Support Bunny, Cloudinary, and local storage as separate adapter packages.
- Keep rich inspection methods behind `uplift/rich`.
- Use PDF tooling for page count and encryption checks in rich PDF routes.
- Use audio metadata tooling for rich audio duration checks.
- Use ffprobe-backed inspection for rich video duration checks and document the host requirement clearly.
- Provide framework adapters for Next.js, Hono, and Express.
- Expose typed client creation from `uplift/client`.
- Expose React hook support from `uplift/react`.
- Keep the fluent builder API focused on file type, constraints, auth, key, metadata, validation, and completion.

## Testing Decisions

- Tests should verify externally observable behavior and type contracts, not internal builder implementation details.
- Type tests should cover single-file route inference, multi-file route inference, `done()` context narrowing, auth user propagation, metadata propagation, and client method signatures.
- Runtime tests should cover size parsing, file type validation, route config materialization, custom validation failures, auth failures, and upload error codes.
- Handler tests should cover multipart request parsing, success responses, validation failure responses, and storage failure responses through framework-neutral behavior first.
- Storage adapter tests should use mocked provider clients or local fakes, avoiding live provider calls by default.
- React tests should cover per-route state transitions for progress, uploading, errors, and last successful data.
- Rich inspection tests should be isolated from core tests and skip or mock host-level tools such as ffprobe when unavailable.
- Build tests should confirm package exports and subpath exports resolve as expected.

## Out of Scope

- A database layer or ORM integration.
- Client-supplied arbitrary metadata as trusted route context.
- A hard dependency on Zod or any other validation library.
- A hard dependency on Axios.
- A custom multipart parser.
- Full media transcoding or image transformation.
- A hosted upload service or dashboard.
- Authentication provider integrations beyond accepting user-provided middleware.
- Browser UI components beyond the React hook state API.

## Further Notes

The critical path is the type inference prototype. If `.multiple()` cannot reliably narrow server and client types, the library loses its main reason to exist. The first implementation slice should prove the builder phantom type and route-to-client inference before deeper runtime work begins.
