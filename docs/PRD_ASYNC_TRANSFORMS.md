# Uplift Async Transforms PRD

## Problem Statement

Uplift supports typed request-time media transforms and derived outputs, but video processing can block the upload request for too long. Developers who accept large videos need the same typed route contract and output model while deferring heavy work to a background worker.

The current synchronous model also makes it hard to provide reliable user feedback after the upload body has reached the server. Developers need a production-grade async transform lifecycle with clear status updates, predictable failure behavior, typed outputs after completion, and cleanup rules for original uploads.

## Solution

Add `.transformAsync(...)` as an explicit sibling to `.transform(...)` on compatible upload builders. Request-time transforms continue to return the completed uploaded file during the upload request. Async transforms accept the original upload, create a background **Transform Job**, and return an `AsyncTransformHandle` that can be observed or awaited until completion.

`.outputs(...)` stays unchanged. For request-time transforms, outputs are available immediately on the completed result. For async transforms, outputs are available after the transform handle completes.

The root `uplift({})` config gains `asyncTransforms`, which configures the queue connection, queue name, timeout, and original upload retention policy. If any route uses `.transformAsync(...)`, root async transform config is required. If root async transform config is provided but no route uses `.transformAsync(...)`, TypeScript should produce a readable error.

The developer-facing client experience should remain route-centered:

```ts
const transform = await upload.clip(file);

transform.id;
transform.status;

const completed = await transform.done();

completed.result.url;
completed.result.output("thumb").url;
```

React route state should expose one lifecycle surface:

```ts
upload.clip.status;
upload.clip.progress;
upload.clip.data;
upload.clip.error;
```

Route listeners provide status-specific lifecycle hooks without encouraging developers to persist Uplift's internal status names directly:

```ts
video()
  .transformAsync(...)
  .outputs(...)
  .listeners({
    queued(ctx) {},
    processing(ctx) {},
    completed(ctx) {},
    failed(ctx) {}
  })
  .done(({ file }) => {});
```

## User Stories

1. As a TypeScript application developer, I want video transforms to run in a background worker, so that large uploads do not block HTTP request threads.
2. As an Uplift developer, I want `.transformAsync(...)` to accept the same transform arguments as `.transform(...)`, so that I can move heavy processing to the background without learning a second media DSL.
3. As an Uplift developer, I want `.transformAsync(...)` to be explicit, so that request-time behavior never changes accidentally.
4. As an Uplift developer, I want `.outputs(...)` to work the same for request-time and async transforms, so that derived artifacts have one mental model.
5. As a frontend developer, I want `upload.clip(file)` to remain the route-named entrypoint, so that async transforms do not introduce a separate job API as the main workflow.
6. As a frontend developer, I want async route calls to return an `AsyncTransformHandle`, so that I can show that processing has been accepted.
7. As a frontend developer, I want `transform.done()` to resolve the completed result, so that imperative apps can wait for final media and outputs.
8. As a frontend developer, I want repeated `transform.done()` calls to return the same terminal result or failure, so that UI code can be retried safely.
9. As a React developer, I want route state to expose `status`, `progress`, `data`, and `error`, so that upload and processing feedback can be rendered from one surface.
10. As a React developer, I want `status` to cover upload and transform lifecycle, so that I do not need separate `uploadProgress` and `processingStatus` fields.
11. As a React developer, I want progress to allow unknown values, so that UI remains correct when ffmpeg or the queue cannot report precise progress.
12. As a backend developer, I want typed outputs available on completed async results, so that `result.output("thumb")` works the same after request-time and background transforms.
13. As a backend developer, I want typed outputs available inside `.done(...)`, so that completion side effects can persist final URLs for primary files and outputs.
14. As a backend developer, I want typed outputs available in global completion hooks, so that cross-route completion behavior can inspect final artifacts consistently.
15. As a backend developer, I want status-specific route listeners, so that I can map Uplift lifecycle events to my own application statuses.
16. As a backend developer, I want listener failures to be best-effort by default, so that analytics or status write failures do not corrupt a successful media transform.
17. As a backend developer, I want `.done(...)` failures to fail the workflow, so that async behavior matches current request-time upload completion semantics.
18. As a backend developer, I want `keepOriginal` to control original upload retention, so that I can choose between cleanup, debugging, and auditability.
19. As a backend developer, I want original uploads deleted by default after terminal states, so that failed async jobs do not silently leak storage.
20. As a backend developer, I want `keepOriginal: "failed"` available, so that failed jobs can preserve source bytes for debugging or manual recovery.
21. As a backend developer, I want async transform timeouts, so that stuck media jobs eventually reach a terminal failure.
22. As a backend developer, I want per-route timeout overrides, so that short clips and longer video routes can have different operational limits.
23. As a maintainer, I want root async transform config required only when async routes exist, so that non-async users do not need queue configuration.
24. As a maintainer, I want readable TypeScript errors for mismatched async config and routes, so that setup mistakes are caught before runtime.
25. As a worker operator, I want the worker to run against the same upload contract as the server, so that queued jobs use the route definitions developers already wrote.
26. As a worker operator, I want worker startup or job execution to fail clearly when the job payload no longer matches the upload contract, so that deploy drift is diagnosable.
27. As a storage adapter author, I want adapters to remain unaware of transform jobs, so that storage implementations continue to receive prepared files through the existing adapter contract.
28. As a product developer, I want realtime state updates when available, so that users can see queued, processing, completed, and failed states promptly.
29. As a product developer, I want polling as a fallback to realtime updates, so that async transforms are correct even without a realtime transport.
30. As a developer handling failures, I want transform failures to use stable provider-neutral Uplift error codes, so that UI and server code can branch without parsing raw worker exceptions.
31. As a developer reading Uplift docs, I want root README examples for async transforms, so that I can understand the feature without opening source code.
32. As a package user, I want package READMEs updated where async transforms affect core, video, or framework usage, so that package-level docs match the shipped API.
33. As a developer evaluating Uplift on the website, I want the static site updated with async transform examples and operational notes, so that the public product narrative is accurate.
34. As a maintainer, I want docs snippets and examples updated for async transforms, so that published examples typecheck against the implemented API.
35. As a maintainer, I want changelogs updated for every affected public package, so that release notes explain the new async transform surface and migration implications.
36. As a maintainer, I want release workflows and smoke-pack verification updated, so that worker exports, queue dependencies, and docs snippets are verified before publish.
37. As a maintainer, I want a new release checklist for async transforms, so that package, docs, site, workflow, changelog, and publish readiness are tracked together.
38. As a maintainer, I want a changeset for affected packages and version bumps from `pnpm changeset version`, so that package releases are reproducible.

## Implementation Decisions

- `.transform(...)` remains the request-time transform API.
- `.transformAsync(...)` is added as a sibling API with the same transform arguments and async runtime behavior.
- `.outputs(...)` continues to declare derived artifacts and automatically belongs to the same execution mode as the route's transform pipeline.
- Request-time transform routes return completed uploaded files from the upload request.
- Async transform routes return an `AsyncTransformHandle` from the upload request.
- `AsyncTransformHandle` exposes an id, a status, and `done()` for awaiting the final result.
- The async completion result contains the final uploaded file result and typed output access.
- The public client should not require a separate route result method such as `upload.clip.result(id)`.
- The root async transform config is named `asyncTransforms`.
- `asyncTransforms` includes queue connection, queue name, default timeout, and `keepOriginal`.
- `keepOriginal` controls whether the **Original Upload** is retained after a transform reaches a terminal state.
- `keepOriginal` accepts `false`, `"failed"`, or `true`, and defaults to `false`.
- Hover docs for `keepOriginal` should explain that it controls original uploaded file retention after async transform success or failure.
- Per-route async transform overrides are passed as an optional final argument to `.transformAsync(...)`.
- Per-route timeout overrides apply to the whole **Transform Job**, not to each individual transform.
- `asyncTransforms` is required at compile time if any route uses `.transformAsync(...)`.
- `asyncTransforms` is rejected at compile time if no route uses `.transformAsync(...)`.
- Type enforcement should use a boolean brand on route builders, route-map scanning, and readable error intersections rather than collapsing to unhelpful `never` errors.
- Async route status values are `queued`, `processing`, `completed`, and `failed`.
- React route status values are `idle`, `uploading`, `queued`, `processing`, `completed`, and `failed`.
- React route progress describes the active lifecycle status and may be unknown when the backend cannot report precise progress.
- Route listeners are configured with `.listeners({ queued, processing, completed, failed })`.
- Route listeners are observational and best-effort by default.
- Listener errors are captured for diagnostics but do not fail the transform workflow.
- `.done(...)` remains the successful completion hook and can fail the workflow.
- Global upload completion keeps the same completed-result semantics as `.done(...)`.
- Auth runs during upload acceptance, not inside the worker.
- Metadata derivation runs during upload acceptance, not inside the worker.
- Cheap static validation runs before creating a **Transform Job**.
- The worker receives enough durable job data to load the original upload, route, metadata, file facts, and transform plan.
- The worker must not depend on a live request object.
- A **Transform Job** should be idempotent by id so worker retries do not create duplicate final objects.
- Status transitions are monotonic: queued to processing to completed, queued to processing to failed, or queued to failed.
- Completed jobs must not later become failed jobs.
- If an output fails after the final primary is written, rollback should delete the final primary and earlier outputs when the storage adapter can delete them.
- If `.done(...)` fails after final artifacts are produced, rollback should match current request-time semantics and the job should become failed.
- Original uploads should be cleaned according to `keepOriginal` after terminal states.
- If final primary key would equal the original upload key, async transforms should reject the configuration or write plan to avoid unsafe cleanup ambiguity.
- Storage adapters remain unaware of async transforms and jobs.
- Realtime updates are an optional transport for state updates, not the source of correctness.
- Polling must be sufficient for `transform.done()` and client state convergence.
- The root README should include a concise async transform route example, client `transform.done()` example, React status example, and worker startup example.
- The core package README should document `.transformAsync(...)`, `asyncTransforms`, `keepOriginal`, `AsyncTransformHandle`, route state, listeners, and worker setup.
- The video package README should explain when to prefer `.transformAsync(...)` over request-time `.transform(...)` for ffmpeg-backed work.
- Framework adapter READMEs should mention any handler or deployment requirements needed for async transform status endpoints or realtime updates.
- Docs snippets should include async transform server, client, React, and worker examples that are typechecked in CI.
- The static site should show async transforms as background media work without implying hosted media infrastructure.
- Package changelogs should be updated for each affected public package, including core, video, framework adapters if their public surface changes, and any new worker or queue package if introduced.
- The root changelog should summarize the async transforms release.
- Release workflow updates should verify worker exports, docs snippets, examples, bundle-size reporting, and smoke-pack coverage for async transform packages.
- A new release checklist should be added under `docs/releases/` for the async transforms release.
- A changeset should mark affected public packages for the correct semver bump, and managed versions should be bumped by `pnpm changeset version` during release preparation.

## Testing Decisions

- Tests should verify public behavior, route contracts, and typed client output rather than private builder internals.
- Type tests should prove routes using `.transformAsync(...)` require root `asyncTransforms`.
- Type tests should prove root `asyncTransforms` is rejected when no route uses `.transformAsync(...)`.
- Type tests should prove `.transformAsync(...)` accepts compatible transforms and rejects incompatible transforms like `.transform(...)`.
- Type tests should prove `.outputs(...)` output names flow into async completion results.
- Type tests should prove undeclared outputs cannot be accessed from async completion results.
- Type tests should prove `.listeners(...)` event contexts are narrowed by listener key.
- Type tests should prove completed listener and `.done(...)` receive typed output access.
- Runtime tests should cover async upload acceptance returning an `AsyncTransformHandle`.
- Runtime tests should cover `transform.done()` resolving completed primary and outputs.
- Runtime tests should cover `transform.done()` rejecting with stored transform failure.
- Runtime tests should cover repeated `transform.done()` calls after completed and failed terminal states.
- Runtime tests should cover route state transitions for uploading, queued, processing, completed, and failed.
- Runtime tests should cover unknown progress where worker progress is unavailable.
- Runtime tests should cover listener invocation for queued, processing, completed, and failed states.
- Runtime tests should prove listener failure does not fail the transform job.
- Runtime tests should prove `.done(...)` failure marks the workflow failed and triggers rollback.
- Runtime tests should prove output failure rolls back final primary and earlier outputs.
- Runtime tests should prove `keepOriginal: false` deletes original uploads after success and failure.
- Runtime tests should prove `keepOriginal: "failed"` keeps original uploads only after failed jobs.
- Runtime tests should prove `keepOriginal: true` keeps original uploads after success and failure.
- Runtime tests should prove worker retries are idempotent by transform id.
- Runtime tests should prove auth and metadata are captured during upload acceptance and are not rerun in the worker.
- Integration tests should cover the worker running against the same upload contract used by the request handler.
- Docs snippet verification should cover async transform server config, client `transform.done()`, React route state, listeners, and worker startup.
- Example verification should include at least one async video transform route.
- Static site verification should confirm async transform examples and operational notes match the implemented API.
- Smoke-pack verification should import any new worker/status exports and compile a consumer using `.transformAsync(...)`.
- Bundle-size verification should confirm core stays free of media and queue runtime dependencies unless those are explicitly part of the chosen package boundary.
- Release verification should include changelogs, changeset, generated version bumps, and the new async transforms release checklist.
- Existing media transform and output tests provide prior art for transform ordering, output typing, output key conventions, and rollback behavior.
- Existing client and React tests provide prior art for route-named method state, retry behavior, progress, data, and error updates.

## Out of Scope

- Chunked or resumable uploads.
- Presigned or client-direct uploads.
- Replacing storage adapters with media-aware lifecycle adapters.
- Hosted queue infrastructure or a managed media dashboard.
- Output-specific storage header overrides.
- Arbitrary output key override APIs.
- Exposing ffmpeg, ffprobe, Sharp, or queue internals through Uplift core APIs.
- A generic `change` listener in the first version.
- Strict listener failure behavior in the first version.
- Client-side transforms.
- Rerunning auth inside the worker.
- Guaranteeing precise media progress for every transform runtime.
- Guaranteeing realtime transport availability.
- Performing the actual package version bump before implementation and release verification are complete.

## Further Notes

The core product rule is that Uplift remains a typed upload contract. Async transforms add a background execution mode for heavy media work, but the developer should still think in route-named upload methods, completed uploaded files, typed outputs, and route lifecycle state.

The most important distinction is that outputs belong to completed uploaded files, not to the upload request itself. Request-time transforms produce completed uploaded files during the request. Async transforms produce an `AsyncTransformHandle` first, then `transform.done()` produces the completed uploaded file result.

The listener model intentionally uses status-specific keys rather than a generic status-change callback. This nudges developers to translate Uplift lifecycle into their own domain statuses instead of blindly persisting internal status strings.
