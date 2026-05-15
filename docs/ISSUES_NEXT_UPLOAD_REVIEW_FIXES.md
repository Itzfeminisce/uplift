# Next Upload Experience Review Fixes

Source: review of the uncommitted Next Upload Experience implementation.

This file keeps the follow-up issue plan local. Each item is written as a GitHub-ready issue body, but no remote issue has been created yet.

## Proposed Breakdown

1. **Fix Framework Adapter Request Bridging**
   - Type: AFK
   - Blocked by: None

2. **Fix Client Retry Eligibility**
   - Type: AFK
   - Blocked by: None

3. **Preserve React Upload Controls Across Renders**
   - Type: AFK
   - Blocked by: 2

4. **Include New Packages In Smoke Pack Verification**
   - Type: AFK
   - Blocked by: None

5. **Add Regression Tests For Review Fixes**
   - Type: AFK
   - Blocked by: 1, 2, 3, 4

---

## Issue 1: Fix Framework Adapter Request Bridging

## What to build

Fix the new framework adapters so they pass a valid WHATWG `Request` into the framework-neutral upload handler. Fastify and Nuxt/Nitro-style entrypoints must preserve method, URL, headers, and body well enough for `HEAD`, `GET`, preflight `POST`, and multipart upload `POST` to reach the core handler correctly.

## Acceptance criteria

- [ ] Fastify plugin usage no longer passes a Node `IncomingMessage` directly to the framework-neutral handler.
- [ ] Fastify adapter preserves method, absolute URL, headers, and request body for upload attempts.
- [ ] Nuxt adapter can handle relative route URLs without throwing before the core handler runs.
- [ ] Nuxt adapter preserves method, URL, headers, and request body for upload attempts where the platform provides them.
- [ ] `HEAD` returns a bodyless health response through both adapters.
- [ ] `GET` returns the public Route Manifest through both adapters.
- [ ] `POST` delegates to Upload Attempt and Preflight handling through both adapters.
- [ ] Adapter behavior stays aligned with the framework-neutral handler instead of duplicating upload policy.

## Blocked by

None - can start immediately.

---

## Issue 2: Fix Client Retry Eligibility

## What to build

Fix route-named vanilla client retry state so `retry()` repeats only the most recent failed or aborted Upload Attempt for that route method. A successful upload must clear or avoid creating retryable state, and `retry()` must continue to reject with a stable error when no retryable attempt exists.

## Acceptance criteria

- [ ] Failed upload attempts become retryable with the original file input.
- [ ] Aborted upload attempts become retryable with the original file input.
- [ ] Successful upload attempts do not become retryable.
- [ ] A successful retry clears stale retry state.
- [ ] Starting a same-route attempt still aborts the previous active same-route attempt.
- [ ] Different route methods still upload concurrently.
- [ ] `retry()` still rejects with a stable Upload Error when no retryable attempt exists.
- [ ] Retry memory remains scoped to the client instance.

## Blocked by

None - can start immediately.

---

## Issue 3: Preserve React Upload Controls Across Renders

## What to build

Fix the React upload hook so route operation controls remain stable across state updates and rerenders. The hook should preserve the underlying client/control state for the hook instance while still exposing current route state (`progress`, `isUploading`, `error`, `data`) on each route method.

## Acceptance criteria

- [ ] The React hook does not recreate the underlying upload client on every route state update.
- [ ] React `retry()` works after a failed attempt triggers a rerender.
- [ ] React `retry()` works after an aborted attempt triggers a rerender.
- [ ] React `abort()` cancels the active attempt for only that route method.
- [ ] React `preflight()` remains available after rerenders.
- [ ] Previous successful data is preserved when a later same-route attempt is aborted.
- [ ] React state transitions remain correct for progress, uploading, error, and data.
- [ ] Retry memory remains scoped to the hook instance.

## Blocked by

- Blocked by Issue 2.

---

## Issue 4: Include New Packages In Smoke Pack Verification

## What to build

Update package smoke verification so every new publishable package added by the Next Upload Experience is packed, installed into the smoke project, imported, and typechecked. `pnpm check` should fail if any new package has broken package metadata, missing dist files, missing exports, or unusable public types.

## Acceptance criteria

- [ ] Smoke pack includes the OpenAPI package.
- [ ] Smoke pack includes Fastify, Elysia, SvelteKit, Remix, TanStack Start, and Nuxt adapter packages.
- [ ] Smoke install imports each new package from the packed tarball.
- [ ] Smoke install typechecks representative usage for each new package.
- [ ] The smoke script remains maintainable as the package list grows.
- [ ] `pnpm smoke:pack` fails when a new package cannot be packed, installed, imported, or typechecked.

## Blocked by

None - can start immediately.

---

## Issue 5: Add Regression Tests For Review Fixes

## What to build

Add focused regression coverage for the review fixes so the corrected behavior cannot silently regress. These tests should exercise public package and adapter surfaces rather than private implementation details.

## Acceptance criteria

- [ ] Fastify adapter tests cover health, manifest, preflight, upload, and failure mapping through framework-shaped request inputs.
- [ ] Nuxt adapter tests cover relative URL handling, health, manifest, preflight, upload, and failure mapping.
- [ ] Vanilla client tests prove successful uploads are not retryable.
- [ ] Vanilla client tests prove failed and aborted attempts are retryable.
- [ ] React tests prove retry memory survives rerenders after failed and aborted attempts.
- [ ] React tests prove previous successful data survives aborting a later attempt.
- [ ] Smoke-pack coverage for new packages is represented in the release verification path.
- [ ] The focused regression tests run as part of the existing local verification commands.

## Blocked by

- Blocked by Issue 1.
- Blocked by Issue 2.
- Blocked by Issue 3.
- Blocked by Issue 4.
