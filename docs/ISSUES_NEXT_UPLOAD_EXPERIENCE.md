# Next Upload Experience Issue Breakdown

Source PRD: `docs/PRD_NEXT_UPLOAD_EXPERIENCE.md`

This file keeps the issue plan local. Each item is written as a GitHub-ready issue body, but no remote issue has been created yet.

Implementation status: all issues below have been implemented and locally verified with `pnpm check`.

## Proposed Breakdown

1. **Add Route Manifest and standard handler HTTP surface**
   - Type: AFK
   - Blocked by: None
   - User stories covered: 7-16, 41, 43

2. **Expand provider-neutral Upload Error Codes**
   - Type: AFK
   - Blocked by: None
   - User stories covered: 20, 37, 45, 47-49

3. **Add Client Operation Controls for abort and retry**
   - Type: AFK
   - Blocked by: 2
   - User stories covered: 17-28, 39, 47

4. **Add Preflight Checks end to end**
   - Type: AFK
   - Blocked by: 1, 2
   - User stories covered: 29-40, 47

5. **Add OpenAPI generation from Route Manifest**
   - Type: AFK
   - Blocked by: 1, 2
   - User stories covered: 41-46

6. **Add Fastify Framework Adapter**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: 1, 7-10, 52, 54, 57

7. **Add Elysia Framework Adapter**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: 5, 7-10, 52, 54, 57

8. **Add SvelteKit Framework Adapter**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: 2, 7-10, 52, 54, 57

9. **Add Remix Framework Adapter**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: 4, 7-10, 52, 54, 57

10. **Add TanStack Start Framework Adapter**
    - Type: AFK
    - Blocked by: 1
    - User stories covered: 3, 7-10, 52, 54, 57

11. **Add Nuxt Framework Adapter**
    - Type: AFK
    - Blocked by: 1
    - User stories covered: 6, 7-10, 52, 54, 57

12. **Document shipped manifest, preflight, controls, OpenAPI, and adapters**
    - Type: AFK
    - Blocked by: 3, 4, 5, 6, 7, 8, 9, 10, 11
    - User stories covered: 50, 52-53

13. **Update workflows, release checklist, changelogs, and changesets**
    - Type: AFK
    - Blocked by: 12
    - User stories covered: 54-57

## Questions Before Filing GitHub Issues

1. Does this granularity feel right, or should the six Framework Adapter issues be grouped by framework family?
2. Should OpenAPI generation wait for Preflight Checks, or is manifest-only generation enough to start after Issue 1?
3. Should the docs/site issue wait for every adapter, or should docs ship in smaller feature batches?

---

## Issue 1: Add Route Manifest And Standard Handler HTTP Surface

## What to build

Add the Route Manifest as the static, serializable description of upload route capabilities, and standardize framework handler HTTP behavior around `HEAD` for health, `GET` for the public Route Manifest, and `POST` for Upload Attempts. This slice should update the existing Framework Adapters first so the manifest contract is proven before adding new adapters.

The public Route Manifest must expose only non-sensitive static capabilities. It must not expose auth implementation details, storage configuration, storage provider names, bucket names, key patterns, callbacks, transform internals, source code, or app-specific runtime policy.

## Acceptance criteria

- [ ] Core exposes a typed Route Manifest shape.
- [ ] Core can derive a Route Manifest from an Upload Contract.
- [ ] The manifest includes safe static capabilities such as route kind, multiplicity, multiple limit, size limits, accepted MIME types, accepted extensions, and static output names.
- [ ] The manifest excludes auth implementation details, storage details, key patterns, callback behavior, and app-specific runtime policy.
- [ ] Existing Framework Adapters return a bodyless health response for `HEAD`.
- [ ] Existing Framework Adapters return the public Route Manifest for `GET`.
- [ ] Existing Framework Adapters continue to delegate `POST` requests to Upload Attempt handling.
- [ ] Existing upload behavior remains backward compatible for `POST`.
- [ ] Runtime tests cover manifest generation.
- [ ] Runtime tests verify sensitive fields are absent.
- [ ] Framework Adapter tests cover `HEAD`, `GET`, and `POST` behavior.
- [ ] Type tests cover the exported Route Manifest shape.

## Blocked by

None - can start immediately.

---

## Issue 2: Expand Provider-Neutral Upload Error Codes

## What to build

Expand Upload Error Codes into more specific, stable, provider-neutral categories that UI code can safely branch on. Keep provider SDK details in messages or causes, not in public error codes.

This slice should preserve compatibility where reasonable while making common scenarios distinguishable, including aborted uploads, unknown routes, invalid requests, method mismatches, too many files, unsafe storage keys, preflight failures, transform failures, output failures, storage failures, and unknown failures.

## Acceptance criteria

- [ ] `ABORTED` is available for client-originated cancellation.
- [ ] Unknown route failures use a specific stable code.
- [ ] unsupported HTTP method failures use a specific stable code.
- [ ] Malformed or unsupported request shape failures use a specific stable code.
- [ ] Too-many-files failures use a specific stable code.
- [ ] Unsafe storage key failures use a specific stable code.
- [ ] Preflight failure has a specific stable code.
- [ ] Transform failure has a specific stable code.
- [ ] Output failure has a specific stable code.
- [ ] Storage failure has a provider-neutral stable code.
- [ ] Existing validation, auth, file size, file type, upload, and unknown codes remain available or have a documented compatibility path.
- [ ] Provider-specific SDK names do not appear as public Upload Error Codes.
- [ ] Runtime tests cover the new stable codes.
- [ ] Client tests verify parsed error codes remain available to UI code.
- [ ] Type tests cover the expanded Upload Error Code union.

## Blocked by

None - can start immediately.

---

## Issue 3: Add Client Operation Controls For Abort And Retry

## What to build

Add Client Operation Controls to route-named upload methods. `abort()` should cancel only the current Upload Attempt for that route method. `retry()` should repeat only the most recent failed or aborted Upload Attempt for that route method, using the original file input while the current client or React hook instance is alive.

Direct route calls such as `upload.avatar(file)` must remain the primary upload path. Different route methods may upload concurrently. A route method may have only one active Upload Attempt at a time; starting a new attempt for the same route aborts the previous one.

## Acceptance criteria

- [ ] Route-named vanilla client methods expose `abort()`.
- [ ] Route-named vanilla client methods expose `retry()`.
- [ ] React upload methods expose `abort()`.
- [ ] React upload methods expose `retry()`.
- [ ] `abort()` cancels the active Upload Attempt for that route method.
- [ ] `abort()` is a no-op when no Upload Attempt is active.
- [ ] Aborted attempts reject with `ABORTED`.
- [ ] `retry()` repeats the most recent failed attempt for that route method.
- [ ] `retry()` repeats the most recent aborted attempt for that route method.
- [ ] `retry()` rejects with a stable error when there is no retryable attempt.
- [ ] Retry memory lasts only for the client or React hook instance.
- [ ] Starting a same-route Upload Attempt aborts the previous same-route Upload Attempt.
- [ ] Different route methods can upload concurrently.
- [ ] React state preserves previous successful data after aborting a later attempt.
- [ ] Client tests cover abort, retry, same-route replacement, and cross-route concurrency.
- [ ] React tests cover progress, uploading, error, data, abort, and retry state transitions.
- [ ] Type tests cover route method controls without breaking direct route calls.

## Blocked by

- Blocked by Issue 2.

---

## Issue 4: Add Preflight Checks End To End

## What to build

Add Preflight Checks as point-in-time server eligibility checks before file bytes are uploaded. The route builder should expose `.preflight(handler)` for app-specific eligibility. Preflight should run auth, static route constraints, and explicit preflight hooks, then report whether the specific file input is eligible to start an Upload Attempt.

Server-side preflight must receive file facts only, not file bytes or streams. A successful client Preflight Check may expose an `upload()` convenience continuation, but direct route calls remain the primary upload path. A later Upload Attempt must still validate again before storage.

## Acceptance criteria

- [ ] Route builders expose `.preflight(handler)`.
- [ ] `.preflight(handler)` receives request, file facts, and user context.
- [ ] `.preflight(handler)` does not receive file bytes or streams.
- [ ] `.preflight(handler)` returns `true` for eligibility or a string message for ineligibility.
- [ ] Preflight runs route/app auth.
- [ ] Preflight runs static constraints such as route existence, multiplicity, count limit, size, MIME type, and extension.
- [ ] Preflight runs explicit preflight hooks.
- [ ] Preflight does not automatically run arbitrary `meta()` or `validate()` logic.
- [ ] Failed Preflight Checks return a stable Upload Error Code and message.
- [ ] Successful client Preflight Checks return `ok: true`.
- [ ] Failed client Preflight Checks return `ok: false` with error details.
- [ ] Successful client Preflight Checks expose an `upload()` continuation.
- [ ] `check.upload()` uses the same upload machinery as the direct route method.
- [ ] Direct route calls such as `upload.avatar(file)` remain supported and documented in tests.
- [ ] Upload Attempts validate again after successful Preflight Checks.
- [ ] Runtime tests cover auth failure, static constraint failure, hook failure, and success.
- [ ] Client tests cover successful and failed preflight flows.
- [ ] Type tests cover `.preflight(handler)` inference and client preflight results.

## Blocked by

- Blocked by Issue 1.
- Blocked by Issue 2.

---

## Issue 5: Add OpenAPI Generation From Route Manifest

## What to build

Add OpenAPI generation from the Route Manifest in a separate package, keeping core focused on upload runtime behavior. The OpenAPI package should describe the manifest-derived upload contract without attempting to document arbitrary runtime validation branches.

OpenAPI output should include upload request shapes, route selection, success responses, standard Upload Error response shapes, safe static route capabilities, and named outputs where known.

## Acceptance criteria

- [ ] OpenAPI generation lives in a separate package from core.
- [ ] Core does not depend on the OpenAPI package.
- [ ] The OpenAPI package accepts a Route Manifest or manifest-compatible input.
- [ ] Generated OpenAPI describes the upload endpoint `POST` behavior.
- [ ] Generated OpenAPI describes Route Manifest `GET` behavior.
- [ ] Generated OpenAPI describes health `HEAD` behavior where useful.
- [ ] Generated OpenAPI includes multipart request shape for single-file routes.
- [ ] Generated OpenAPI includes multipart request shape for multi-file routes.
- [ ] Generated OpenAPI includes `UploadedFile` response shape.
- [ ] Generated OpenAPI includes standard Upload Error response shape.
- [ ] Generated OpenAPI includes safe static route capabilities in descriptions or schema metadata.
- [ ] Generated OpenAPI does not expose runtime hooks, storage details, auth internals, or key patterns.
- [ ] Tests verify OpenAPI output from representative manifests.
- [ ] Type tests or build tests verify package exports.

## Blocked by

- Blocked by Issue 1.
- Blocked by Issue 2.

---

## Issue 6: Add Fastify Framework Adapter

## What to build

Add a Fastify Framework Adapter as a separate package. The adapter should expose Uplift through Fastify's request and response model while preserving the standard handler HTTP surface: `HEAD` for health, `GET` for Route Manifest, and `POST` for Upload Attempts.

## Acceptance criteria

- [ ] Fastify adapter package exists as an isolated dependency surface.
- [ ] Fastify adapter exposes a public handler or plugin API that follows local package conventions.
- [ ] `HEAD` returns a bodyless health response.
- [ ] `GET` returns the public Route Manifest.
- [ ] `POST` delegates to the framework-neutral Upload Attempt handler.
- [ ] Upload behavior matches the Upload Contract.
- [ ] Tests cover health, manifest, successful upload, and failure mapping.
- [ ] Package exports are configured for ESM and CJS according to repo conventions.
- [ ] Package README documents shipped usage.
- [ ] Changelog and changeset are prepared for the new package.

## Blocked by

- Blocked by Issue 1.

---

## Issue 7: Add Elysia Framework Adapter

## What to build

Add an Elysia Framework Adapter as a separate package. The adapter should expose Uplift through Elysia's request and response model while preserving the standard handler HTTP surface: `HEAD` for health, `GET` for Route Manifest, and `POST` for Upload Attempts.

## Acceptance criteria

- [ ] Elysia adapter package exists as an isolated dependency surface.
- [ ] Elysia adapter exposes a public handler or plugin API that follows local package conventions.
- [ ] `HEAD` returns a bodyless health response.
- [ ] `GET` returns the public Route Manifest.
- [ ] `POST` delegates to the framework-neutral Upload Attempt handler.
- [ ] Upload behavior matches the Upload Contract.
- [ ] Tests cover health, manifest, successful upload, and failure mapping.
- [ ] Package exports are configured for ESM and CJS according to repo conventions.
- [ ] Package README documents shipped usage.
- [ ] Changelog and changeset are prepared for the new package.

## Blocked by

- Blocked by Issue 1.

---

## Issue 8: Add SvelteKit Framework Adapter

## What to build

Add a SvelteKit Framework Adapter as a separate package. The adapter should expose Uplift through SvelteKit's endpoint conventions while preserving the standard handler HTTP surface: `HEAD` for health, `GET` for Route Manifest, and `POST` for Upload Attempts.

## Acceptance criteria

- [ ] SvelteKit adapter package exists as an isolated dependency surface.
- [ ] SvelteKit adapter exposes framework-native endpoint handlers.
- [ ] `HEAD` returns a bodyless health response.
- [ ] `GET` returns the public Route Manifest.
- [ ] `POST` delegates to the framework-neutral Upload Attempt handler.
- [ ] Upload behavior matches the Upload Contract.
- [ ] Tests cover health, manifest, successful upload, and failure mapping.
- [ ] Package exports are configured for ESM and CJS according to repo conventions.
- [ ] Package README documents shipped usage.
- [ ] Changelog and changeset are prepared for the new package.

## Blocked by

- Blocked by Issue 1.

---

## Issue 9: Add Remix Framework Adapter

## What to build

Add a Remix Framework Adapter as a separate package. The adapter should expose Uplift through Remix's route/action conventions while preserving the standard handler HTTP surface: `HEAD` for health, `GET` for Route Manifest, and `POST` for Upload Attempts.

## Acceptance criteria

- [ ] Remix adapter package exists as an isolated dependency surface.
- [ ] Remix adapter exposes framework-native route/action helpers.
- [ ] `HEAD` returns a bodyless health response.
- [ ] `GET` returns the public Route Manifest.
- [ ] `POST` delegates to the framework-neutral Upload Attempt handler.
- [ ] Upload behavior matches the Upload Contract.
- [ ] Tests cover health, manifest, successful upload, and failure mapping.
- [ ] Package exports are configured for ESM and CJS according to repo conventions.
- [ ] Package README documents shipped usage.
- [ ] Changelog and changeset are prepared for the new package.

## Blocked by

- Blocked by Issue 1.

---

## Issue 10: Add TanStack Start Framework Adapter

## What to build

Add a TanStack Start Framework Adapter as a separate package. The adapter should expose Uplift through TanStack Start's server route conventions while preserving the standard handler HTTP surface: `HEAD` for health, `GET` for Route Manifest, and `POST` for Upload Attempts.

## Acceptance criteria

- [ ] TanStack Start adapter package exists as an isolated dependency surface.
- [ ] TanStack Start adapter exposes framework-native route helpers.
- [ ] `HEAD` returns a bodyless health response.
- [ ] `GET` returns the public Route Manifest.
- [ ] `POST` delegates to the framework-neutral Upload Attempt handler.
- [ ] Upload behavior matches the Upload Contract.
- [ ] Tests cover health, manifest, successful upload, and failure mapping.
- [ ] Package exports are configured for ESM and CJS according to repo conventions.
- [ ] Package README documents shipped usage.
- [ ] Changelog and changeset are prepared for the new package.

## Blocked by

- Blocked by Issue 1.

---

## Issue 11: Add Nuxt Framework Adapter

## What to build

Add a Nuxt Framework Adapter as a separate package. The adapter should expose Uplift through Nuxt/Nitro server route conventions while preserving the standard handler HTTP surface: `HEAD` for health, `GET` for Route Manifest, and `POST` for Upload Attempts.

## Acceptance criteria

- [ ] Nuxt adapter package exists as an isolated dependency surface.
- [ ] Nuxt adapter exposes framework-native server route helpers.
- [ ] `HEAD` returns a bodyless health response.
- [ ] `GET` returns the public Route Manifest.
- [ ] `POST` delegates to the framework-neutral Upload Attempt handler.
- [ ] Upload behavior matches the Upload Contract.
- [ ] Tests cover health, manifest, successful upload, and failure mapping.
- [ ] Package exports are configured for ESM and CJS according to repo conventions.
- [ ] Package README documents shipped usage.
- [ ] Changelog and changeset are prepared for the new package.

## Blocked by

- Blocked by Issue 1.

---

## Issue 12: Document Shipped Manifest, Preflight, Controls, OpenAPI, And Adapters

## What to build

Update public documentation only for shipped behavior. This includes the root README, package READMEs, docs snippets, and static site coverage for the Route Manifest, Preflight Checks, Client Operation Controls, OpenAPI generation, expanded Upload Error Codes, and new Framework Adapters.

## Acceptance criteria

- [ ] Root README documents shipped Route Manifest behavior.
- [ ] Root README documents shipped `HEAD`, `GET`, and `POST` handler behavior.
- [ ] Root README documents shipped `abort()` and `retry()` behavior.
- [ ] Root README documents shipped Preflight Check behavior.
- [ ] Root README documents shipped OpenAPI package usage.
- [ ] Root README documents the expanded Upload Error Codes.
- [ ] Package READMEs document each new Framework Adapter.
- [ ] Package READMEs document the OpenAPI package.
- [ ] Static site documents manifest, preflight, controls, OpenAPI, and new adapters.
- [ ] Static site avoids mentioning unshipped behavior.
- [ ] Docs snippets are added or updated for shipped APIs.
- [ ] Docs snippet checks cover new examples.
- [ ] Site remains static and publishable through the existing Pages workflow.

## Blocked by

- Blocked by Issue 3.
- Blocked by Issue 4.
- Blocked by Issue 5.
- Blocked by Issue 6.
- Blocked by Issue 7.
- Blocked by Issue 8.
- Blocked by Issue 9.
- Blocked by Issue 10.
- Blocked by Issue 11.

---

## Issue 13: Update Workflows, Release Checklist, Changelogs, And Changesets

## What to build

Prepare the feature set for release by updating workflows, release checklists, package changelogs, changesets, and package versions according to the repo's release process. Release work is part of the product surface and should cover all changed packages, new packages, docs, examples, site output, smoke checks, and package publishing paths.

## Acceptance criteria

- [ ] CI workflows cover new packages and checks where needed.
- [ ] Release workflow includes new packages and package files where needed.
- [ ] Pages workflow still publishes the static site correctly.
- [ ] Release checklist is added or updated for the next upload experience feature set.
- [ ] Release checklist includes builds, type checks, tests, docs snippet checks, examples checks, bundle-size checks where applicable, smoke packing, changelog review, and site review.
- [ ] Changelogs are updated for every changed package.
- [ ] Changelogs mention new Framework Adapters.
- [ ] Changelogs mention Route Manifest and handler HTTP surface changes.
- [ ] Changelogs mention Client Operation Controls.
- [ ] Changelogs mention Preflight Checks.
- [ ] Changelogs mention OpenAPI generation.
- [ ] Changelogs mention expanded Upload Error Codes.
- [ ] Changesets are prepared for every affected package.
- [ ] Package versions are bumped through the repo's release process when implementation is ready.
- [ ] Local release verification commands are documented in the release checklist.

## Blocked by

- Blocked by Issue 12.
