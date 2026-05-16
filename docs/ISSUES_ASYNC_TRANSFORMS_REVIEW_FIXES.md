# Async Transforms Review Fixes

Source review: end-to-end async transforms review follow-up.

This file keeps broader review findings local. Each item is written as a GitHub-ready issue body, but no remote issue has been created.

## Proposed Breakdown

1. **Make async Transform Jobs durable across worker boundaries**
   - Type: AFK
   - Blocked by: None
   - User stories covered: background worker execution, Original Upload lifecycle, Completed Async Transform Result

2. **Release terminal Transform Job file bodies from memory**
   - Type: AFK
   - Blocked by: 1 if durable storage shape changes first; otherwise None
   - User stories covered: Original Upload lifecycle, Transform Job cleanup

3. **Align async route multiplicity between types and runtime**
   - Type: AFK
   - Blocked by: None
   - User stories covered: typed client upload methods, async upload acceptance

4. **Define or reject mixed request-time and async transforms**
   - Type: AFK
   - Blocked by: None
   - User stories covered: transform route semantics, async worker execution

5. **Parse async transform route options unambiguously**
   - Type: AFK
   - Blocked by: None
   - User stories covered: route-level async transform options

6. **Protect Transform Job status reads**
   - Type: HITL
   - Blocked by: None
   - User stories covered: polling status reads, upload contract privacy

7. **Bound and validate client `transform.done()` polling**
   - Type: AFK
   - Blocked by: None
   - User stories covered: terminal result semantics, polling fallback

8. **Type async lifecycle listeners with route context**
   - Type: AFK
   - Blocked by: None
   - User stories covered: lifecycle listeners, typed output access

---

## Issue 1: Make Async Transform Jobs Durable Across Worker Boundaries

## What to build

Make Transform Jobs runnable by a background worker that does not share request-process memory. A queued Transform Job should contain enough durable information for a worker to load the Original Upload bytes from storage, run async transforms, and produce the Completed Async Transform Result after process restarts or from a separate worker process.

This may require adding a storage read capability, defining a queue/job persistence boundary, or explicitly narrowing the current feature to same-process workers until durable queues are implemented. The accepted behavior should be documented and covered by tests.

## Acceptance criteria

- [ ] A worker can run a queued Transform Job without relying on an in-memory `File` body captured during upload acceptance.
- [ ] The Original Upload storage reference is sufficient for worker execution.
- [ ] Storage capabilities needed by async workers are represented in public or internal types.
- [ ] Missing Original Upload bytes fail the Transform Job with a provider-neutral Upload Error.
- [ ] Tests cover worker execution when the in-memory request body is unavailable.
- [ ] Docs do not imply cross-process worker durability unless the implementation supports it.

## Blocked by

- None - can start immediately.

---

## Issue 2: Release Terminal Transform Job File Bodies From Memory

## What to build

Ensure terminal Transform Jobs do not retain large Original Upload `File` bodies in memory after completion or failure. `keepOriginal` controls storage retention, but in-memory job state should also drop byte-heavy references once they are no longer required.

The status endpoint should remain readable after cleanup, including id, route, status, progress, result, and normalized error where applicable.

## Acceptance criteria

- [ ] Completed Transform Jobs no longer retain the Original Upload `File` body.
- [ ] Failed Transform Jobs no longer retain the Original Upload `File` body unless an explicit retry/debug policy requires it.
- [ ] `readTransformJobStatus` remains usable after body cleanup.
- [ ] Original Upload storage cleanup still follows `keepOriginal`.
- [ ] Tests prove terminal jobs keep metadata/status but drop byte-heavy body references.
- [ ] Cleanup is idempotent if a worker reads a terminal job repeatedly.

## Blocked by

- None - can start immediately.

---

## Issue 3: Align Async Route Multiplicity Between Types And Runtime

## What to build

Make the Upload Contract for async transform routes agree between TypeScript and runtime behavior. Today async runtime accepts exactly one file, while builder and client output types can still represent multi-file async routes.

Choose one contract: either reject `.multiple().transformAsync(...)` at type/build time, or implement true multi-file Transform Job handling end to end.

## Acceptance criteria

- [ ] Type tests cover the chosen async multiplicity contract.
- [ ] Runtime validation matches the type-level contract.
- [ ] Client output type for async routes cannot claim uploaded file arrays unless multi-file async jobs are implemented.
- [ ] Builder chaining order around `.multiple()` and `.transformAsync()` is covered.
- [ ] Error messages are clear when unsupported async multi-file routes are configured or invoked.

## Blocked by

- None - can start immediately.

---

## Issue 4: Define Or Reject Mixed Request-Time And Async Transforms

## What to build

Define the behavior when a route chains both request-time `.transform(...)` and `.transformAsync(...)`. The implementation should not silently drop request-time transforms when async transforms are present.

Either reject mixed transform chains with a readable error, or define and implement an explicit ordering that applies both transform sets consistently.

## Acceptance criteria

- [ ] Mixed `.transform(...)` and `.transformAsync(...)` chains have documented semantics.
- [ ] If mixing is unsupported, builder or upload acceptance rejects it with a clear Upload Error.
- [ ] If mixing is supported, tests prove request-time and async transforms run in the documented order.
- [ ] Existing request-time-only transform routes keep current behavior.
- [ ] Existing async-only transform routes keep current behavior.
- [ ] Docs and snippets avoid unsupported mixed chains.

## Blocked by

- None - can start immediately.

---

## Issue 5: Parse Async Transform Route Options Unambiguously

## What to build

Make `.transformAsync(...transforms, options)` detect route options safely even when the options object is empty or future optional fields are added.

An empty options object should not be treated as a transform, and invalid objects should fail early with a readable error instead of crashing later during worker transform execution.

## Acceptance criteria

- [ ] `.transformAsync(transform, {})` is either accepted as options or rejected clearly at builder time.
- [ ] Route option detection does not depend only on the presence of `timeout`.
- [ ] Invalid transform-like objects produce a readable error before worker execution.
- [ ] Type tests cover empty and future-compatible route option objects.
- [ ] Runtime tests cover the selected empty-options behavior.

## Blocked by

- None - can start immediately.

---

## Issue 6: Protect Transform Job Status Reads

## What to build

Decide and implement the access model for `GET ?job=<id>` Transform Job status reads. Job ids currently act as bearer tokens for status, result URLs, and failure messages. That may be acceptable, but it should be explicit and tested.

If status reads should be protected by route auth or ownership, the status endpoint must validate the request before returning job details.

## Acceptance criteria

- [ ] The Transform Job status access model is documented as either bearer-id or auth-protected.
- [ ] If auth-protected, status reads run the appropriate upload contract auth/ownership checks.
- [ ] If bearer-id, docs warn that job ids should be treated as sensitive.
- [ ] Status reads do not expose more result/error detail than the chosen model allows.
- [ ] Tests cover unauthorized or unknown status reads.
- [ ] Error responses remain provider-neutral.

## Blocked by

- None - can start immediately.

---

## Issue 7: Bound And Validate Client `transform.done()` Polling

## What to build

Harden `AsyncTransformHandle.done()` polling so clients do not wait forever on malformed, stale, or wrong endpoint responses. Polling should remain the correctness baseline, but it needs bounded failure behavior and response-shape validation.

The API may add timeout/abort options or use a sensible default failure mode for invalid status payloads.

## Acceptance criteria

- [ ] `done()` rejects when the status response is not a Transform Job status payload.
- [ ] `done()` can be aborted or bounded by a documented timeout.
- [ ] Queued or processing jobs continue polling within the configured bounds.
- [ ] Failed status responses reject with a stable Upload Error.
- [ ] Repeated `done()` calls preserve terminal result or terminal failure memoization.
- [ ] Tests cover malformed status payloads and stale non-terminal jobs.

## Blocked by

- None - can start immediately.

---

## Issue 8: Type Async Lifecycle Listeners With Route Context

## What to build

Improve async lifecycle listener types so listener callbacks receive route-specific auth, metadata, and completed output types where those are available from the Upload Contract.

Listener types should support typed output access for completed Transform Job results, matching the public docs and type-first API promise.

## Acceptance criteria

- [ ] `queued` listener context carries route-specific user and metadata types.
- [ ] `completed` listener context carries typed completed output names.
- [ ] `failed` and `processing` listener contexts remain provider-neutral and stable.
- [ ] Type tests prove listener callbacks infer user, metadata, and output types.
- [ ] Runtime listener behavior remains best-effort and does not fail the Transform Job.
- [ ] Public docs and snippets match the final listener type surface.

## Blocked by

- None - can start immediately.
