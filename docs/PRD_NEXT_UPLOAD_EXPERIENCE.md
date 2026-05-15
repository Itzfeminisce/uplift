# Next Upload Experience PRD

## Problem Statement

Uplift has a clear Upload Contract and a small set of framework adapters, but the next planned surface is still under-specified. Developers need more framework entrypoints, clearer client-side control over upload attempts, a safe way to inspect route capabilities before uploading, a point-in-time preflight check for richer upload UIs, and an OpenAPI path that does not bloat core or expose sensitive application behavior.

Without these decisions captured as a PRD, implementation could blur boundaries between Framework Adapters, Upload Attempts, Preflight Checks, Route Manifests, and Upload Error Codes. That would make the API harder to reason about and could lead to public documentation promising behavior before it exists.

## Solution

Expand Uplift around a manifest-first upload endpoint and a more expressive client upload experience.

Framework Adapters will remain thin request/response translators around the framework-neutral upload handler. The adapter family will grow to cover Fastify, SvelteKit, TanStack Start, Remix, Elysia, and Nuxt while preserving the same Upload Contract semantics. Adapters will standardize on `HEAD` for health, `GET` for the public Route Manifest, and `POST` for Upload Attempts.

The client will gain Client Operation Controls on route-named upload methods. `abort()` cancels the current Upload Attempt for that route, and `retry()` repeats the most recent failed or aborted attempt using the original file input while the client or React hook instance is alive.

Uplift will introduce a Route Manifest as a safe, static, serializable description of route capabilities. The manifest will power client inspection, public endpoint discovery, and OpenAPI generation. A separate OpenAPI package will generate OpenAPI documents from the Route Manifest rather than from arbitrary runtime hooks.

Uplift will introduce Preflight Checks as point-in-time server eligibility checks before file bytes are uploaded. Preflight runs auth, static route constraints, and explicit route preflight hooks. It is advisory, not realtime validation, and the later Upload Attempt must still validate again before storage.

Uplift will expand Upload Error Codes into more specific, stable, provider-neutral categories so UI code can branch on meaningful failure cases without coupling to provider SDK errors.

## User Stories

1. As a Fastify developer, I want a Framework Adapter for Fastify, so that I can mount Uplift without writing request translation code.
2. As a SvelteKit developer, I want a Framework Adapter for SvelteKit, so that upload routes fit the framework's endpoint model.
3. As a TanStack Start developer, I want a Framework Adapter for TanStack Start, so that Uplift can be used in modern TanStack applications.
4. As a Remix developer, I want a Framework Adapter for Remix, so that upload actions can use Uplift's Upload Contract.
5. As an Elysia developer, I want a Framework Adapter for Elysia, so that Bun-oriented applications can adopt Uplift cleanly.
6. As a Nuxt developer, I want a Framework Adapter for Nuxt, so that Vue/Nitro applications can expose Uplift upload endpoints.
7. As a framework user, I want every Framework Adapter to preserve the same Upload Contract semantics, so that switching frameworks does not change route behavior.
8. As a framework user, I want `HEAD` on the upload endpoint to act as a bodyless health check, so that infrastructure can verify the endpoint is mounted.
9. As a frontend developer, I want `GET` on the upload endpoint to return a Route Manifest, so that the client can inspect available route capabilities.
10. As a frontend developer, I want `POST` on the upload endpoint to remain the upload path, so that existing route-named upload calls keep their meaning.
11. As a frontend developer, I want a public Route Manifest, so that route capabilities can be discovered without custom documentation.
12. As a security-conscious developer, I want the public Route Manifest to expose only non-sensitive static capabilities, so that auth logic, storage details, key patterns, and callbacks are not leaked.
13. As a UI developer, I want to know whether a route accepts one file or multiple files, so that I can render the right file input behavior.
14. As a UI developer, I want to know accepted MIME types and extensions, so that I can guide users before they upload.
15. As a UI developer, I want to know route size limits, so that I can block obviously invalid files before spending bandwidth.
16. As a UI developer, I want to know output names where they are static, so that I can render predictable post-upload previews.
17. As a frontend developer, I want `upload.avatar.abort()` to cancel the current avatar Upload Attempt, so that users can stop an upload they no longer want.
18. As a frontend developer, I want `abort()` to be scoped to one route method, so that cancelling avatar does not cancel gallery.
19. As a frontend developer, I want `abort()` to be a no-op when there is no active Upload Attempt, so that cancel buttons can be wired safely.
20. As a frontend developer, I want aborted uploads to surface an `ABORTED` Upload Error Code, so that I can avoid showing false failure messages.
21. As a frontend developer, I want `upload.avatar.retry()` to repeat the most recent failed or aborted avatar Upload Attempt, so that retry buttons are simple to wire.
22. As a frontend developer, I want `retry()` to use the original file input, so that the user does not need to reselect the same file immediately.
23. As a frontend developer, I want retry memory to last only for the current client or React hook instance, so that Uplift does not imply resumable uploads across reloads.
24. As a frontend developer, I want only one active Upload Attempt per route method, so that route state remains unambiguous.
25. As a frontend developer, I want starting a new route attempt to abort the previous same-route attempt, so that progress and error state belong to the latest attempt.
26. As a frontend developer, I want different route methods to upload concurrently, so that independent UI sections can operate at the same time.
27. As a React developer, I want `abort()` and `retry()` to work with React upload state, so that progress, loading, error, and data state stay consistent.
28. As a React developer, I want prior successful data to remain available after aborting a later attempt, so that UI does not lose a known-good result.
29. As a developer, I want a route builder `.preflight(handler)` hook, so that app-specific pre-upload eligibility can live in the Upload Contract.
30. As a developer, I want `.preflight(handler)` to return `true` or a string message, so that it mirrors the simplicity of route validation.
31. As a backend developer, I want `.preflight(handler)` to receive file facts only, so that preflight remains lightweight and does not parse or stream file bytes.
32. As a backend developer, I want Preflight Checks to run auth, so that unauthorized users can be rejected before uploading bytes.
33. As a backend developer, I want Preflight Checks to run static route constraints, so that file type, size, multiplicity, and count issues can be reported early.
34. As a backend developer, I want Preflight Checks to run explicit preflight hooks, so that app-specific eligibility can be checked intentionally.
35. As a backend developer, I want Preflight Checks not to automatically run arbitrary `meta()` or `validate()` behavior, so that side effects and byte-dependent logic are not accidentally duplicated.
36. As a frontend developer, I want `upload.avatar.preflight(file)` to return an `ok` result, so that I can branch UI before uploading.
37. As a frontend developer, I want failed Preflight Checks to return a stable Upload Error Code and message, so that user feedback can be consistent.
38. As a frontend developer, I want successful Preflight Checks to expose a convenience `upload()` continuation, so that the checked file can be uploaded without rewiring the direct route call.
39. As a frontend developer, I want direct route calls such as `upload.avatar(file)` to remain the primary upload path, so that simple apps do not need preflight ceremony.
40. As a developer, I want Preflight Checks to be documented as point-in-time and advisory, so that I understand the later Upload Attempt still validates again.
41. As a tooling user, I want OpenAPI generation from the Route Manifest, so that upload endpoints can be described without inspecting runtime hooks.
42. As a library maintainer, I want OpenAPI generation in a separate package, so that core stays focused on upload runtime behavior.
43. As a library maintainer, I want core to expose the manifest shape needed by OpenAPI tooling, so that the OpenAPI package can remain thin and deterministic.
44. As an API consumer, I want OpenAPI output to include standard upload request and response shapes, so that API clients can understand Uplift endpoints.
45. As an API consumer, I want OpenAPI output to include standard Upload Error response shapes, so that failure handling is documented.
46. As a maintainer, I want OpenAPI generation to avoid arbitrary runtime validation branches, so that generated documents remain stable.
47. As a frontend developer, I want more specific Upload Error Codes, so that UI can distinguish validation, request, storage, transform, output, abort, and unknown failures.
48. As a storage user, I want provider-neutral storage failure codes, so that UI does not depend on S3, R2, Bunny, Cloudinary, UploadThing, local, or memory internals.
49. As a maintainer, I want raw provider error details to remain in messages or causes rather than codes, so that public error categories stay stable.
50. As a documentation reader, I want the public README and site to document only shipped features, so that docs do not promise unfinished behavior.
51. As a future contributor, I want the PRD, context, and ADRs to explain these decisions before implementation, so that I do not accidentally flatten the domain boundaries.
52. As a package consumer, I want package READMEs to reflect the shipped adapter and client APIs, so that npm package pages are accurate.
53. As a site visitor, I want the documentation site to describe manifest, preflight, abort, retry, OpenAPI, and new adapters only after they ship, so that the site matches installable behavior.
54. As a maintainer, I want changelogs for every changed package, so that release notes explain both runtime behavior and package-surface changes.
55. As a maintainer, I want release checklists for this feature set, so that publishing does not miss docs, examples, package exports, or smoke checks.
56. As a maintainer, I want workflow updates where new packages or checks require them, so that CI and release automation continue to cover the full workspace.
57. As a maintainer, I want version bumps managed consistently through changesets, so that multi-package releases stay coherent.

## Implementation Decisions

- Keep Framework Adapters thin. They translate framework request and response shapes into the framework-neutral upload handler and do not own storage, auth policy, UI, or upload route behavior.
- Add Framework Adapters for Fastify, SvelteKit, TanStack Start, Remix, Elysia, and Nuxt as separate dependency surfaces.
- Use the same adapter family language as the existing framework packages: each adapter exposes framework-native handlers that preserve the Upload Contract.
- Standardize adapter HTTP behavior around `HEAD` for health, `GET` for Route Manifest, and `POST` for Upload Attempts.
- Replace body-bearing `GET` health behavior with a public Route Manifest response.
- Keep `HEAD` health simple and bodyless.
- Define the Route Manifest as static, serializable route capability metadata.
- Expose only non-sensitive static capabilities in the public Route Manifest.
- Include safe manifest capabilities such as route kind, multiplicity, multiple limit, size limits, accepted MIME types, accepted extensions, and static output names.
- Exclude auth implementation details, middleware names, storage providers, bucket names, key patterns, regions, signed URL details, callbacks, transform internals, source code, and app-specific runtime policy from the public manifest.
- Use the Route Manifest as the foundation for OpenAPI generation.
- Put OpenAPI generation in a separate package rather than core.
- Let core expose the manifest shape and helpers required for documentation and tooling.
- Introduce Client Operation Controls on route-named upload methods.
- Add `abort()` as a Client Operation Control scoped to the current Upload Attempt for that route method.
- Make `abort()` a no-op when no Upload Attempt is active for the route method.
- Add `retry()` as a Client Operation Control scoped to the most recent failed or aborted Upload Attempt for that route method.
- Make `retry()` reject with a stable error when there is no retryable attempt.
- Keep retry memory in the client or React hook instance only.
- Do not persist retry inputs across reloads or storage boundaries.
- Allow different route methods to upload concurrently.
- Disallow overlapping Upload Attempts for the same route method.
- Starting a new Upload Attempt for a route method aborts the previous in-flight attempt for that route method.
- Preserve direct route calls such as `upload.avatar(file)` as the primary upload path.
- Add `.preflight(handler)` as a route builder method for app-specific Preflight Check eligibility.
- Make `.preflight(handler)` return `true` for eligibility or a string message for ineligibility.
- Make server-side Preflight Checks operate on file facts, not file bytes or streams.
- Run auth and static route constraints during Preflight Checks.
- Run explicit `.preflight(handler)` hooks during Preflight Checks.
- Do not automatically run arbitrary `meta()` or `validate()` logic during Preflight Checks.
- Keep Preflight Checks advisory and point-in-time.
- Validate again during the later Upload Attempt before storage.
- Allow successful client Preflight Checks to expose a convenience `upload()` continuation.
- Ensure `check.upload()` uses the same upload machinery as the direct route method.
- Expand Upload Error Codes into more specific, stable, provider-neutral categories.
- Add an abort-specific Upload Error Code so UI can distinguish cancellation from failure.
- Avoid provider-specific Upload Error Codes.
- Keep public README and site documentation behind implementation; repo context and ADRs may lead implementation, but public docs should describe shipped behavior only.
- Update root README documentation only when shipped behavior is available.
- Update affected package READMEs so npm package pages match the final APIs.
- Update the static site after implementation reaches the corresponding shipped features.
- Add changelog entries for every changed package.
- Add changesets for package version bumps and release notes.
- Add or update release checklists for the feature release.
- Update workflows when new packages, examples, docs checks, OpenAPI checks, or release steps require CI/release coverage.

## Testing Decisions

- Tests should verify public behavior and type contracts, not internal implementation details.
- Framework Adapter tests should verify `HEAD`, `GET`, and `POST` behavior through framework-native entrypoints where practical.
- Framework Adapter tests should prove that adapters delegate upload attempts to the same Upload Contract behavior as existing adapters.
- Route Manifest tests should verify that safe static capabilities are present.
- Route Manifest tests should verify that sensitive fields are absent.
- OpenAPI tests should verify output from representative manifests rather than runtime route hooks.
- Client Operation Control tests should cover aborting an active same-route Upload Attempt.
- Client Operation Control tests should cover aborting with no active attempt.
- Client Operation Control tests should cover same-route replacement aborting the older attempt.
- Client Operation Control tests should cover different routes uploading concurrently.
- Client Operation Control tests should cover retry after failed attempts.
- Client Operation Control tests should cover retry after aborted attempts.
- Client Operation Control tests should cover retry rejection when there is no retryable attempt.
- React tests should verify state transitions for progress, uploading, errors, data preservation, abort, and retry.
- Preflight tests should verify auth failure, static constraint failure, explicit hook failure, and successful continuation.
- Preflight tests should verify that file bytes are not required by the server-side preflight path.
- Upload Attempt tests should verify that validation still runs after a successful Preflight Check.
- Upload Error Code tests should verify stable codes for request, validation, auth, abort, storage, transform, output, and unknown failures.
- Storage-related tests should continue to use mocked provider boundaries or local fakes rather than live provider calls.
- Type tests should cover direct route calls, preflight methods, successful preflight continuations, abort, retry, and route multiplicity.
- Documentation tests should be added only when public docs are updated for shipped features.
- Release checklist verification should include package builds, type checks, tests, docs snippet checks, examples checks, bundle-size checks where applicable, smoke packing, changelog review, and site content review.
- Workflow changes should be tested by running the closest local equivalents before relying on CI.

## Out of Scope

- Implementing these features as part of this PRD-writing step.
- Resumable uploads across reloads, browser storage, or server sessions.
- Chunked upload protocols.
- Hosted upload service behavior.
- Provider-specific error code taxonomies.
- Authenticated or per-user filtered manifests in the first manifest version.
- Exposing storage configuration or key patterns through the public Route Manifest.
- Running arbitrary byte-dependent validation during Preflight Checks.
- Replacing direct route calls with preflight-only upload flows.
- Documenting unshipped features on the public README or site.
- Publishing packages as part of this PRD-writing step.
- Bumping package versions before implementation and changesets are ready.

## Further Notes

The recommended implementation order is Route Manifest and adapter HTTP surface first, then Client Operation Controls, then Preflight Checks, then OpenAPI generation, then release/documentation work once behavior has shipped.

The deepest modules to extract are the Route Manifest builder, the client attempt controller, the preflight evaluator, and the OpenAPI generator. Each should expose a small interface over behavior that can be tested independently from framework adapters.

The Route Manifest should be treated as the stable contract between runtime upload routes, clients, and documentation tooling. Preflight should be treated as a smart gate, not as a guarantee. Upload Attempts remain the only path that stores files and triggers completion behavior.

Release work is part of the product surface. Once implementation lands, the release slice should update changelogs, changesets, package READMEs, the root README, the site, release checklists, package versions, and any workflows needed to keep the new packages and checks covered.
