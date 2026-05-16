# Async Transforms Issue Breakdown

Source PRD: `docs/PRD_ASYNC_TRANSFORMS.md`

This file keeps the issue plan local. Each item is written as a GitHub-ready issue body, but no remote issue has been created.

## Proposed Breakdown

1. **Add async transform typing and config guardrails**
   - Type: AFK
   - Blocked by: None
   - User stories covered: 2-4, 18, 21-24

2. **Add transform job store and original upload lifecycle**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: 18-21, 25-27, 30

3. **Accept async uploads and return `AsyncTransformHandle`**
   - Type: AFK
   - Blocked by: 1, 2
   - User stories covered: 1, 5-8, 18-24, 27, 30

4. **Implement worker execution for async transforms and outputs**
   - Type: AFK
   - Blocked by: 2, 3
   - User stories covered: 1-4, 12-14, 17-22, 25-27, 30

5. **Add `transform.done()` polling and terminal result semantics**
   - Type: AFK
   - Blocked by: 3, 4
   - User stories covered: 5-8, 12, 29-30

6. **Add React async transform route state**
   - Type: AFK
   - Blocked by: 3, 5
   - User stories covered: 9-11, 28-30

7. **Add status-specific route listeners**
   - Type: AFK
   - Blocked by: 2, 4
   - User stories covered: 13-17, 30

8. **Add realtime status update transport with polling fallback**
   - Type: AFK
   - Blocked by: 5, 6
   - User stories covered: 9-11, 28-30

9. **Document async transforms in README, package docs, snippets, and examples**
   - Type: AFK
   - Blocked by: 5, 6, 7
   - User stories covered: 31-34

10. **Update static site for async transforms**
    - Type: AFK
    - Blocked by: 9
    - User stories covered: 31, 33

11. **Harden smoke-pack, bundle-size, examples, and release workflows**
    - Type: AFK
    - Blocked by: 4, 5, 6, 9
    - User stories covered: 34, 36

12. **Prepare changelogs, changeset, version bump, and release checklist**
    - Type: AFK
    - Blocked by: 9, 10, 11
    - User stories covered: 35, 37-38

13. **Route Transform Job status through all Framework Adapters**
    - Type: AFK
    - Blocked by: 5
    - User stories covered: 5-8, 29-30

14. **Prevent timed-out Transform Jobs from writing late results**
    - Type: AFK
    - Blocked by: 4
    - User stories covered: 12-14, 17-22, 25-27, 30

15. **Make React retry follow the async transform lifecycle**
    - Type: AFK
    - Blocked by: 5, 6
    - User stories covered: 9-11, 28-30

16. **Avoid orphaned Transform Jobs when Original Upload storage fails**
    - Type: AFK
    - Blocked by: 2, 3
    - User stories covered: 1, 18-21, 25-27, 30

---

## Issue 1: Add Async Transform Typing And Config Guardrails

## What to build

Add the public type surface for async transform routes without changing runtime behavior yet. Upload builders should expose `.transformAsync(...)` as an explicit sibling to `.transform(...)`, with the same transform compatibility rules and an optional final override object for route-level async transform options.

The root `uplift({})` config should accept `asyncTransforms` only when at least one route uses `.transformAsync(...)`. If async routes exist without root async config, or root async config exists without async routes, TypeScript should produce readable errors.

## Acceptance criteria

- [ ] Compatible builders expose `.transformAsync(...transforms)`.
- [ ] `.transformAsync(...)` accepts the same compatible transform types as `.transform(...)`.
- [ ] `.transformAsync(...)` rejects incompatible transforms where route kind is known.
- [ ] `.transformAsync(...)` accepts an optional final route override object.
- [ ] Route override object supports timeout for the whole Transform Job.
- [ ] Route builders carry an async transform brand that can be scanned from the route map.
- [ ] `uplift({ asyncTransforms, routes })` typechecks when at least one route uses `.transformAsync(...)`.
- [ ] `uplift({ routes })` produces a readable type error when any route uses `.transformAsync(...)`.
- [ ] `uplift({ asyncTransforms, routes })` produces a readable type error when no route uses `.transformAsync(...)`.
- [ ] `asyncTransforms.keepOriginal` accepts `false`, `"failed"`, or `true`.
- [ ] `keepOriginal` has hover docs explaining original upload retention after terminal states.
- [ ] Type tests cover all config guardrail cases and readable error helpers.

## Blocked by

None - can start immediately.

---

## Issue 2: Add Transform Job Store And Original Upload Lifecycle

## What to build

Introduce the internal Transform Job model needed for async transform routes. The job model should track route name, original upload facts, original upload key, metadata, status, progress, errors, terminal result, timeout, and cleanup policy. This slice should also define the original upload lifecycle and cleanup behavior without requiring the worker to execute real media transforms yet.

This should be implemented as a deep module with a small interface that can be tested without framework adapters or media packages.

## Acceptance criteria

- [ ] Core has a Transform Job representation with id, route, status, progress, timeout, original upload reference, metadata, error, and terminal result fields.
- [ ] Transform Job statuses are `queued`, `processing`, `completed`, and `failed`.
- [ ] Status transitions are monotonic and prevent completed jobs from becoming failed.
- [ ] Job ids are collision-resistant and stable across worker retries.
- [ ] Original Upload keys are internal and collision-resistant.
- [ ] Original Upload cleanup follows `keepOriginal: false`, `"failed"`, and `true`.
- [ ] Original Upload cleanup runs after terminal success or failure according to config.
- [ ] Final primary key and original upload key collisions are rejected or safely prevented.
- [ ] Transform Job errors are normalized to provider-neutral Upload Errors.
- [ ] Job store tests cover status transitions, terminal reads, cleanup policy, and collision prevention.

## Blocked by

- Blocked by Issue 1.

---

## Issue 3: Accept Async Uploads And Return `AsyncTransformHandle`

## What to build

Update the upload request path so async transform routes validate, derive metadata, store the Original Upload, create a queued Transform Job, and return an `AsyncTransformHandle` instead of blocking for final transforms. Request-time `.transform(...)` routes should keep their existing behavior.

The initial async upload request should fail normally before a handle exists when auth, validation, request parsing, or original upload storage fails.

## Acceptance criteria

- [ ] Async transform routes store the untransformed Original Upload before creating a Transform Job.
- [ ] Auth runs during upload acceptance.
- [ ] Metadata derivation runs during upload acceptance.
- [ ] Cheap static validation runs before creating a Transform Job.
- [ ] Upload acceptance enqueues a queued Transform Job with route, file facts, original upload reference, metadata, timeout, and cleanup policy.
- [ ] Async upload requests return an `AsyncTransformHandle` payload with id, route, and status.
- [ ] Request-time transform routes continue returning completed uploaded files.
- [ ] Initial request failures return existing Upload Error responses and do not create handles.
- [ ] Original Upload storage failure returns a storage/upload error and does not create a job.
- [ ] Multi-file async behavior is either supported end-to-end or rejected with a deliberate documented error for the first slice.
- [ ] Runtime tests cover successful async acceptance and pre-handle failures.

## Blocked by

- Blocked by Issue 1.
- Blocked by Issue 2.

---

## Issue 4: Implement Worker Execution For Async Transforms And Outputs

## What to build

Add worker execution for Transform Jobs. The worker should load the same upload contract used by the server, read the Original Upload, run `.transformAsync(...)` transforms, write the final primary object, produce declared outputs, run strict completion hooks, and mark the job completed or failed.

The worker must not depend on a live request object or rerun auth. It should use durable job payload data captured during upload acceptance.

## Acceptance criteria

- [ ] Worker startup accepts the upload contract and async transform connection config.
- [ ] Worker execution loads queued jobs and marks them processing.
- [ ] Worker reads the Original Upload from storage or the chosen durable original upload abstraction.
- [ ] Worker runs async transforms left to right.
- [ ] Worker writes the final primary object through the existing storage adapter contract.
- [ ] Worker writes declared outputs through the existing storage adapter contract.
- [ ] Completed result exposes typed output data on server-side completed objects.
- [ ] Worker runs route `.done(...)` after final primary and outputs are available.
- [ ] Worker runs global completion hooks with the completed result.
- [ ] `.done(...)` or global completion failure marks the workflow failed and rolls back final primary and outputs.
- [ ] Output failure rolls back final primary and earlier outputs when delete is available.
- [ ] Worker timeout marks the job failed with a stable Upload Error.
- [ ] Worker retries are idempotent by Transform Job id.
- [ ] Worker detects incompatible job payload or upload contract drift with a clear error.
- [ ] Runtime tests cover success, transform failure, output failure, completion failure, timeout, retry idempotency, and contract drift.

## Blocked by

- Blocked by Issue 2.
- Blocked by Issue 3.

---

## Issue 5: Add `transform.done()` Polling And Terminal Result Semantics

## What to build

Implement the client-side `AsyncTransformHandle` behavior. Calling `transform.done()` should wait for the Transform Job to reach a terminal state using polling as the correctness baseline, then resolve the completed result or reject with the stored failure.

The completed async result should expose the same typed output getter as request-time completed upload results.

## Acceptance criteria

- [ ] Vanilla client returns an `AsyncTransformHandle` for async transform routes.
- [ ] `AsyncTransformHandle` exposes id, route, status, and `done()`.
- [ ] `transform.done()` polls job status until completed or failed.
- [ ] `transform.done()` resolves completed primary file results.
- [ ] Completed async results expose typed `output("name")` access.
- [ ] Undeclared outputs remain TypeScript errors.
- [ ] `transform.done()` rejects with the stored Upload Error when the job fails.
- [ ] Repeated `transform.done()` calls after completion return the same completed result.
- [ ] Repeated `transform.done()` calls after failure reject with the same stored failure.
- [ ] Request-time routes keep the existing vanilla client result type.
- [ ] Runtime and type tests cover async handle behavior, terminal reads, output getters, and sync route compatibility.

## Blocked by

- Blocked by Issue 3.
- Blocked by Issue 4.

---

## Issue 6: Add React Async Transform Route State

## What to build

Update the React upload hook so async transform routes expose one route state surface across upload acceptance and background processing. The state should use `status`, `progress`, `data`, and `error`, with `data` becoming the completed uploaded file only after the Transform Job completes.

Existing route operation controls should remain stable across state updates.

## Acceptance criteria

- [ ] React route state includes `status`, `progress`, `data`, and `error`.
- [ ] Status values include `idle`, `uploading`, `queued`, `processing`, `completed`, and `failed`.
- [ ] Upload request progress maps to `uploading`.
- [ ] Accepted async jobs transition route state to `queued`.
- [ ] Worker progress updates transition or maintain `processing`.
- [ ] Unknown worker progress is represented without lying about percentage.
- [ ] Completed jobs set `status` to `completed` and `data` to the final uploaded result.
- [ ] Failed jobs set `status` to `failed` and expose a stable Upload Error.
- [ ] Same-route new attempts replace the visible state for that route.
- [ ] Different route methods remain independent.
- [ ] React hook tests cover state transitions, stable operation controls, completed data, failure, and unknown progress.

## Blocked by

- Blocked by Issue 3.
- Blocked by Issue 5.

---

## Issue 7: Add Status-Specific Route Listeners

## What to build

Add `.listeners({ queued, processing, completed, failed })` to route builders for async transform lifecycle observation. Listeners should be best-effort by default and should not fail the Transform Job. The completed listener should receive the completed result with typed output access.

`.done(...)` remains the strict success hook and can fail the workflow.

## Acceptance criteria

- [ ] Route builders expose `.listeners(...)` with status-specific keys.
- [ ] `queued` listener receives Transform Job identity and route context.
- [ ] `processing` listener receives Transform Job identity and progress when available.
- [ ] `completed` listener receives Transform Job identity and completed result with typed outputs.
- [ ] `failed` listener receives Transform Job identity and normalized Upload Error.
- [ ] Listener context types are narrowed by listener key.
- [ ] Listener errors are captured for diagnostics.
- [ ] Listener errors do not fail the Transform Job.
- [ ] `.done(...)` remains strict and still fails the workflow when it throws.
- [ ] Type tests cover listener context narrowing and typed completed outputs.
- [ ] Runtime tests cover all listener keys and best-effort error handling.

## Blocked by

- Blocked by Issue 2.
- Blocked by Issue 4.

---

## Issue 8: Add Realtime Status Update Transport With Polling Fallback

## What to build

Add a realtime update path for async transform status and progress while keeping polling as the correctness fallback. The transport should update vanilla and React client state promptly when available, but all terminal behavior must remain correct without it.

Framework adapters should expose any required status or realtime endpoints by delegating to core behavior rather than owning upload policy.

## Acceptance criteria

- [ ] Core exposes a framework-neutral way to read Transform Job status.
- [ ] Core exposes a framework-neutral realtime status stream or subscription handler if a transport is chosen for v1.
- [ ] Vanilla client can subscribe to realtime updates when configured or available.
- [ ] React hook uses realtime updates when available.
- [ ] Polling remains sufficient for `transform.done()` and route state convergence.
- [ ] Realtime disconnects fall back to polling.
- [ ] Status is authoritative and progress is treated as optional.
- [ ] Framework adapters delegate status/realtime requests to core.
- [ ] Adapter tests cover status and realtime request forwarding where applicable.
- [ ] Client tests cover realtime success, disconnect fallback, and polling-only behavior.

## Blocked by

- Blocked by Issue 5.
- Blocked by Issue 6.

---

## Issue 9: Document Async Transforms In README, Package Docs, Snippets, And Examples

## What to build

Document the async transform model across root docs, package READMEs, typechecked snippets, and examples. The docs should explain request-time transforms versus background Transform Jobs, `AsyncTransformHandle`, `transform.done()`, typed outputs, route state, listeners, worker setup, `keepOriginal`, timeout, and polling/realtime behavior.

Docs must avoid implying hosted media infrastructure.

## Acceptance criteria

- [ ] Root README includes async transform route, client, React, listener, and worker examples.
- [ ] `@uplift-io/uplift` README documents `.transformAsync(...)`, `asyncTransforms`, `keepOriginal`, `AsyncTransformHandle`, route status, listeners, and worker setup.
- [ ] `@uplift-io/video` README explains when async transforms are preferred over request-time ffmpeg work.
- [ ] Framework adapter READMEs mention any async transform status or realtime deployment requirements.
- [ ] Docs snippets include server config, client `transform.done()`, React route state, listeners, and worker startup.
- [ ] Docs snippets typecheck.
- [ ] Example app includes at least one async video transform route.
- [ ] Example verification passes.
- [ ] Docs consistently use Transform Job, Original Upload, Upload Status, and AsyncTransformHandle terminology.

## Blocked by

- Blocked by Issue 5.
- Blocked by Issue 6.
- Blocked by Issue 7.

---

## Issue 10: Update Static Site For Async Transforms

## What to build

Update the static site so async transforms appear as a shipped production capability. The site should show background media work, route-centered client usage, status updates, typed outputs after completion, and worker setup without implying that Uplift hosts queues, dashboards, or managed media infrastructure.

## Acceptance criteria

- [ ] Static site includes an async video transform example.
- [ ] Static site distinguishes `.transform(...)` from `.transformAsync(...)`.
- [ ] Static site shows `transform.done()` and typed output access after completion.
- [ ] Static site shows React route `status`, `progress`, `data`, and `error`.
- [ ] Static site mentions Original Upload cleanup and `keepOriginal`.
- [ ] Static site mentions polling fallback and optional realtime updates.
- [ ] Static site includes worker setup or deployment notes.
- [ ] Site examples match typechecked docs snippets.
- [ ] Site verification passes.

## Blocked by

- Blocked by Issue 9.

---

## Issue 11: Harden Smoke-Pack, Bundle-Size, Examples, And Release Workflows

## What to build

Update local and CI release verification so async transform public exports, worker/status entrypoints, docs snippets, examples, package boundaries, and bundle-size expectations are checked before publishing.

This slice should ensure release automation catches missing exports, accidental queue dependencies in core, and examples that drift from the implemented API.

## Acceptance criteria

- [ ] Smoke-pack imports async transform client types and any worker/status exports.
- [ ] Smoke-pack compiles a consumer using `.transformAsync(...)`, `.outputs(...)`, `transform.done()`, and listeners.
- [ ] Docs snippet verification includes async transform snippets.
- [ ] Example verification includes the async video transform example.
- [ ] Bundle-size verification confirms core stays free of media and queue runtime dependencies unless intentionally changed.
- [ ] Build workflow includes any new packages or entrypoints.
- [ ] Release workflow verifies worker/status exports.
- [ ] CI runs the async transform verification path.
- [ ] Local `pnpm check` or equivalent covers the new verification steps.

## Blocked by

- Blocked by Issue 4.
- Blocked by Issue 5.
- Blocked by Issue 6.
- Blocked by Issue 9.

---

## Issue 12: Prepare Changelogs, Changeset, Version Bump, And Release Checklist

## What to build

Prepare release materials after implementation and verification are complete. This includes updating changelogs, adding a changeset for affected public packages, running the managed version bump, and completing the async transforms release checklist.

This slice should not happen before the implementation, docs, site, and workflow verification slices are complete.

## Acceptance criteria

- [ ] Root changelog summarizes async transforms.
- [ ] `@uplift-io/uplift` changelog documents `.transformAsync(...)`, `asyncTransforms`, `AsyncTransformHandle`, `transform.done()`, listeners, route state, and worker setup.
- [ ] `@uplift-io/video` changelog documents async ffmpeg-backed transform guidance if package behavior or docs changed.
- [ ] Framework adapter changelogs document status/realtime endpoint support if public adapter behavior changed.
- [ ] Any new public package changelog is created and updated.
- [ ] Changeset marks affected public packages for the correct semver bump.
- [ ] `pnpm changeset version` is run after changeset approval.
- [ ] Managed package versions and lockfile changes are reviewed.
- [ ] `docs/releases/1.4.0-async-transforms-checklist.md` is completed through all applicable implementation, docs, verification, and release items.
- [ ] CI is green on the release branch.

## Blocked by

- Blocked by Issue 9.
- Blocked by Issue 10.
- Blocked by Issue 11.

---

## Issue 13: Route Transform Job Status Through All Framework Adapters

## What to build

Ensure every Framework Adapter exposes Transform Job status reads through the same Upload Contract endpoint used by `AsyncTransformHandle.done()`.

Plain `GET /upload` should continue to return the Route Manifest. `GET /upload?job=<id>` should delegate to the framework-neutral upload handler so clients can poll Transform Job status and receive the Completed Async Transform Result or stored Upload Error.

## Acceptance criteria

- [ ] Next Framework Adapter routes `GET` requests with a `job` query parameter through the framework-neutral upload handler.
- [ ] Hono Framework Adapter routes `GET` requests with a `job` query parameter through the framework-neutral upload handler.
- [ ] Existing Route Manifest behavior for plain `GET /upload` remains unchanged.
- [ ] Adapter tests prove `transform.done()` polling can read completed Transform Job status through Next.
- [ ] Adapter tests prove `transform.done()` polling can read completed Transform Job status through Hono.
- [ ] Any other Framework Adapter with custom `GET` manifest behavior is checked and updated if needed.

## Blocked by

- Blocked by Issue 5.

---

## Issue 14: Prevent Timed-Out Transform Jobs From Writing Late Results

## What to build

Harden Transform Job timeout behavior so a timed-out job cannot later write storage objects, run strict completion hooks, fire completion listeners, or call global completion callbacks after the job has already failed.

The final behavior should preserve a single terminal Transform Job state. Once timeout failure wins, later async transform work must not publish a Completed Async Transform Result or leave untracked storage writes behind.

## Acceptance criteria

- [ ] A Transform Job that exceeds its timeout reaches `failed` with a provider-neutral Upload Error.
- [ ] Timed-out transform work cannot later mark the same Transform Job `completed`.
- [ ] Timed-out transform work cannot later run route `done()` or global `onUploadComplete`.
- [ ] Timed-out transform work cannot leave final primary or output objects written outside rollback control.
- [ ] Runtime tests cover a transform that resolves after timeout.
- [ ] Runtime tests cover repeated terminal reads after timeout.

## Blocked by

- Blocked by Issue 4.

---

## Issue 15: Make React Retry Follow The Async Transform Lifecycle

## What to build

Update React Client Operation Control retry behavior so retried async Upload Attempts follow the same Upload Status lifecycle as first attempts.

When `retry()` returns an `AsyncTransformHandle`, React route state should move to `queued` or `processing`, keep completed data empty until `done()` resolves, then set the Completed Async Transform Result. Failure from `done()` should set Upload Status to `failed` and preserve the stored Upload Error.

## Acceptance criteria

- [ ] React `retry()` detects `AsyncTransformHandle` results.
- [ ] Retried async Upload Attempts set Upload Status to `queued` or `processing` after upload acceptance.
- [ ] Retried async Upload Attempts set `progress` to `null` while worker progress is unknown.
- [ ] Retried async Upload Attempts do not set route `data` to the handle.
- [ ] Retried async Upload Attempts set completed `data` only after `done()` resolves.
- [ ] Retried async Upload Attempts set Upload Status to `failed` when `done()` rejects.
- [ ] React tests cover async retry success and failure.

## Blocked by

- Blocked by Issue 5.
- Blocked by Issue 6.

---

## Issue 16: Avoid Orphaned Transform Jobs When Original Upload Storage Fails

## What to build

Make async upload acceptance atomic from the caller's point of view: a failed Original Upload storage write must not leave a queued Transform Job that a worker can later process.

The implementation may store the Original Upload before creating the queued Transform Job, create the job in a compensating failed state, or remove the queued job after storage failure. The observable contract is that failed upload acceptance does not create runnable background work.

## Acceptance criteria

- [ ] If Original Upload storage fails, the upload request fails with a provider-neutral Upload Error.
- [ ] If Original Upload storage fails, no queued Transform Job remains runnable by `runNextTransformJob`.
- [ ] If Original Upload storage fails, `queued` listeners are not emitted for work that cannot run.
- [ ] If Original Upload storage fails after any internal allocation, cleanup or compensation preserves readable terminal state where applicable.
- [ ] Runtime tests cover Original Upload storage failure during async upload acceptance.
- [ ] Runtime tests cover `runNextTransformJob` after failed Original Upload storage.

## Blocked by

- Blocked by Issue 2.
- Blocked by Issue 3.
