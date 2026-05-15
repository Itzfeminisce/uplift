# Uplift Storage Headers and Rollback PRD

## Problem Statement

Uplift's route builders currently overload the word `headers` for CSV file-column validation, while storage adapters have no route-level way to receive object upload headers such as cache policy or content disposition. Developers who upload images, videos, PDFs, CSVs, JSON files, or custom files to object storage need a simple way to set storage/object headers from the route contract without dropping into provider-specific adapter code.

At the same time, Uplift already attempts cleanup after some partial upload failures, but most official adapters only implement `put`. When an upload writes a primary object or generated outputs and then later fails, providers without `delete` support can leave orphaned files behind. This weakens the reliability story for transforms, outputs, completion hooks, and storage-provider integrations.

Uplift needs a tighter end-to-end storage contract: route builders should expose clear storage headers, CSV should use clearer column terminology, official adapters should support deletion where provider APIs allow it, and request failure should roll back every object written during that request.

## Solution

Make `headers()` a shared builder API across all upload primitives. In every route kind, `headers()` means storage/object upload headers passed to the configured storage adapter. It supports static headers and dynamic headers derived from request, file, user, and metadata context.

Move CSV file-structure validation from `headers()` to `columns()`. CSV routes keep `delimiter()` and also allow delimiter configuration through `columns()` options.

Keep the storage adapter shape plain and easy to implement. The adapter still has `provider`, `put`, and optional `delete`; `put` receives resolved storage headers, and official adapters implement `delete` wherever the provider documents a deletion API.

Update server rollback so that if a request returns a failure after writing any object, Uplift attempts to delete every object written during that request. Rollback errors do not replace the original upload error.

## User Stories

1. As an Uplift developer, I want `image().headers(...)`, so that I can set storage headers for uploaded images without provider-specific code in my route.
2. As an Uplift developer, I want `video().headers(...)`, so that uploaded videos can declare cache and delivery behavior at the route level.
3. As an Uplift developer, I want `audio().headers(...)`, so that audio files can use the same storage-header contract as other media.
4. As an Uplift developer, I want `pdf().headers(...)`, so that document downloads can declare content disposition and cache behavior.
5. As an Uplift developer, I want `text().headers(...)`, so that plain text uploads can control storage object headers.
6. As an Uplift developer, I want `json().headers(...)`, so that JSON uploads can use the same storage-header contract as other routes.
7. As an Uplift developer, I want `csv().headers(...)` to mean storage headers, so that the word has one meaning across all route builders.
8. As an Uplift developer, I want `custom().headers(...)`, so that application-specific MIME routes can still set storage headers.
9. As an Uplift developer, I want `any().headers(...)`, so that generic attachment routes can still control object storage behavior.
10. As an Uplift developer, I want static storage headers, so that common settings such as cache policy are easy to declare.
11. As an Uplift developer, I want dynamic storage headers, so that file name, user, request, and metadata can influence storage behavior.
12. As an Uplift developer, I want dynamic headers to run after auth and metadata derivation, so that header decisions can use trusted server context.
13. As an Uplift developer, I want route-level headers to apply to the primary object and generated outputs by default, so that a route has one clear storage policy.
14. As an Uplift developer, I want CSV column validation to use `columns()`, so that `headers()` is no longer ambiguous.
15. As an Uplift developer, I want `csv().columns(["email", "name"])`, so that required import columns are obvious.
16. As an Uplift developer, I want `csv().columns(["email"], { delimiter: ";" })`, so that common CSV structure can be configured compactly.
17. As an Uplift developer, I want `csv().delimiter(";")`, so that delimiter can still be configured in a readable chain.
18. As an Uplift developer, I want the last delimiter configuration to win, so that fluent composition remains predictable.
19. As an adapter author, I want `StoragePutInput` to include resolved headers, so that adapter implementations do not need to know about route builders.
20. As an S3 user, I want Uplift storage headers translated to S3 object parameters, so that cache and disposition behavior reaches S3.
21. As an R2 user, I want the same S3-compatible header and delete behavior, so that R2 remains a thin S3-compatible adapter.
22. As a Bunny user, I want storage headers merged into safe Bunny upload request headers, so that delivery behavior can be configured where Bunny supports it.
23. As a Cloudinary user, I want docs explaining which headers map to Cloudinary upload parameters, so that unsupported storage-header behavior is not surprising.
24. As a Cloudinary user, I want unsigned uploads to keep working, so that simple Cloudinary setups remain easy.
25. As a Cloudinary user, I want cleanup to work when signed credentials are provided, so that failed multi-step uploads do not leave assets behind.
26. As an UploadThing user, I want the adapter to support deletion through the provider's delete API or an injected deleter, so that rollback can clean up uploaded files.
27. As a local storage user, I want headers to be safely ignored or documented as not persisted, so that local development remains simple.
28. As a memory storage user, I want headers to be safely ignored or available only for test inspection if needed, so that tests stay predictable.
29. As an Uplift user with outputs, I want rollback to delete the primary file and every output written before a later failure, so that failed requests do not leave orphaned files.
30. As an Uplift user with `done()` callbacks, I want rollback if `done()` fails, so that the HTTP failure response matches storage state where possible.
31. As an Uplift user with `onUploadComplete`, I want rollback if the global completion hook fails, so that app-level failure still cleans up written objects.
32. As an Uplift user, I want rollback errors to preserve the original upload error, so that the client sees the real reason the request failed.
33. As a custom adapter author, I want `delete` to remain optional, so that small or experimental adapters stay easy to write.
34. As a custom adapter author, I want docs recommending `delete`, so that I understand the cleanup tradeoff if I omit it.
35. As a maintainer, I want official adapters to implement `delete` where documented by providers, so that Uplift's built-in adapters model good behavior.
36. As a maintainer, I want provider docs cited in implementation notes, so that delete behavior matches official provider APIs.
37. As a maintainer, I want tests for storage headers and rollback, so that changes to transforms, outputs, adapters, or hooks do not regress cleanup semantics.
38. As a maintainer, I want the public builder autocomplete to stay clean, so that new APIs do not reintroduce internal implementation details.
39. As a developer reading docs, I want the difference between storage headers and CSV columns to be explicit, so that migration from older CSV `headers()` usage is straightforward.
40. As a developer upgrading Uplift, I want migration guidance from `csv().headers([...])` to `csv().columns([...])`, so that breaking changes are quick to fix.
41. As a developer evaluating Uplift from the docs site, I want storage headers and rollback behavior shown in the public site, so that I understand the feature before installing.
42. As a developer reading the README, I want quick examples for `headers()` and `csv().columns()`, so that the naming change is immediately visible.
43. As a developer using an official adapter, I want the adapter README or docs section to state whether delete-based cleanup is supported, so that I can configure credentials correctly.
44. As a Cloudinary user, I want the docs site and package docs to explain unsigned upload versus signed cleanup credentials, so that I do not assume rollback works without secrets.
45. As a maintainer, I want docs snippets for storage headers and CSV columns to typecheck, so that launch examples cannot drift from the implemented API.
46. As a maintainer, I want the static docs site to remain publishable through the existing Pages workflow, so that launch docs ship with the feature.
47. As a maintainer, I want CI to run typecheck, tests, docs snippet checks, examples checks, bundle-size reporting, build, and smoke-pack, so that the release is not only locally correct.
48. As a maintainer, I want release workflow coverage checked after adapter changes, so that new package APIs and exports publish correctly.
49. As a maintainer, I want changelog and changeset entries for the breaking CSV rename and new adapter behavior, so that users can upgrade safely.
50. As a maintainer, I want a release checklist entry for this launch, so that docs, tests, site, workflows, changelog, and package versions are verified together.

## Implementation Decisions

- `headers()` is a shared upload-builder method available on every route kind.
- `headers()` means storage/object headers everywhere.
- CSV file-column validation moves to `columns()`.
- CSV `columns()` accepts an array of column names.
- CSV `columns()` accepts an optional options object with `delimiter`.
- CSV `delimiter()` remains available as a chainable method.
- If `columns()` options and `delimiter()` both set a delimiter, the last call wins.
- Internal route definition fields should use clear domain names such as `storageHeaders`, `csvColumns`, and `csvDelimiter`.
- Static headers and dynamic headers are both supported.
- Dynamic headers receive route context including request, file, user, and metadata.
- Dynamic headers resolve after auth and metadata derivation.
- Route-level headers apply to the primary object and generated outputs by default.
- Output-specific storage headers are out of scope for the first pass.
- `StoragePutInput` receives resolved headers as plain string key/value pairs.
- The storage adapter contract remains plain: `provider`, `put`, and optional `delete`.
- Do not add a `capabilities` object to the adapter contract.
- Official adapters should implement `delete` wherever the provider has a documented deletion API.
- Custom adapters may omit `delete`, but docs must explain that rollback cannot remove written files for those adapters.
- S3 deletion should use the AWS SDK `DeleteObjectCommand`.
- R2 deletion should pass through the S3-compatible delete implementation.
- Bunny deletion should use the provider's storage file `DELETE` endpoint with `AccessKey`.
- Cloudinary deletion should use the signed Upload API `destroy` path.
- Cloudinary cleanup requires server-side signed credentials such as API key and API secret.
- Cloudinary unsigned upload support should remain available.
- UploadThing deletion should use the provider's file deletion API or an injected deleter.
- Local and memory adapters already support deletion and should continue to do so.
- Server rollback should track every object written during an upload request.
- If any later step fails before the HTTP response succeeds, rollback should attempt deletion for all written objects.
- Rollback applies to output-generation failures, route completion failures, and global completion failures.
- Rollback errors should not replace the original upload error returned to the client.
- Rollback failure observability can be revisited later with hooks or logging, but is not part of the first implementation.
- Documentation must include a storage-header guide, CSV migration note, cleanup/rollback guide, and adapter-specific cleanup notes.
- The root README must include a short route-builder example showing shared `headers()` and CSV `columns()`.
- Package READMEs for core and affected official adapters must document the new API or cleanup behavior.
- The static docs site must be updated so storage headers, CSV columns, and cleanup semantics appear in launch-facing documentation.
- Docs snippets should be added or updated so `pnpm docs:check` verifies public examples for shared `headers()` and CSV `columns()`.
- Existing examples should be updated if they show CSV `headers()` or would benefit from storage-header examples.
- Bundle-size docs or site data should be regenerated if the implementation changes public package output size.
- CI workflow coverage must include the verification commands needed for this launch.
- Pages workflow compatibility must be preserved for the static `site` directory.
- Release workflow compatibility must be checked for all affected packages.
- Changelog and changesets must describe the breaking CSV rename, shared storage headers, adapter delete support, and rollback behavior.
- A release checklist should be added or updated under the docs release area for this feature launch.
- The feature is not launch-ready until code, tests, docs snippets, README/package docs, static site, workflows, changelog, and release checklist are all complete.

## Testing Decisions

- Tests should verify public behavior and route contracts, not private builder internals.
- Type tests should prove `headers()` exists on every public route builder.
- Type tests should prove `csv().columns(...)` exists and `csv().headers([...])` no longer represents column validation.
- Type tests should prove dynamic `headers()` receives correctly inferred user and metadata context.
- Type tests should prove builder narrowing is preserved after chaining `headers()`, `auth()`, `meta()`, `multiple()`, and `outputs()`.
- Runtime tests should prove static storage headers are passed to `storage.put()`.
- Runtime tests should prove dynamic storage headers are resolved with file, user, request, and metadata context.
- Runtime tests should prove route headers apply to outputs by default.
- Runtime tests should prove CSV `columns()` validates the first row using the configured delimiter.
- Runtime tests should prove `columns()` delimiter options and `delimiter()` compose with last-call-wins behavior.
- Runtime tests should prove rollback deletes every written object when output generation fails.
- Runtime tests should prove rollback deletes every written object when `done()` fails.
- Runtime tests should prove rollback deletes every written object when `onUploadComplete()` fails.
- Runtime tests should prove the original upload error is preserved when rollback delete fails.
- Adapter tests should verify S3 sends delete commands with bucket and key.
- Adapter tests should verify R2 delegates delete through the S3-compatible adapter.
- Adapter tests should verify Bunny calls the documented delete endpoint with the access key.
- Adapter tests should verify Cloudinary delete requires signed credentials and calls the signed destroy path.
- Adapter tests should verify UploadThing delete calls the configured provider deletion path.
- Documentation examples should be typechecked where practical.
- Migration docs should include examples from old CSV `headers()` usage to new `columns()` usage.
- Site examples should be reviewed against the implemented API, especially any quickstart, CSV, storage, or media sections.
- README examples should be reviewed against the implemented API.
- Package README examples should be reviewed for every affected official adapter.
- `pnpm docs:check` should cover new or changed docs snippets.
- `pnpm examples:check` should pass after any example updates.
- `pnpm smoke:pack` should verify packed package exports after builder, type, and adapter changes.
- `pnpm bundle:size` should be run if bundle-size data is shown in docs or site.
- CI workflow changes should be validated by matching the local release verification path.
- Release workflow changes should be checked so affected packages publish with correct files and subpath exports.
- The release checklist should include a final command list covering typecheck, tests, docs check, examples check, build, bundle size, smoke pack, and static site verification.

## Out of Scope

- Provider capability metadata on storage adapters.
- Output-specific storage headers.
- Arbitrary provider-specific headers without validation or translation.
- Background job queues for cleanup retries.
- Cleanup after a success response has already been sent.
- A durable cleanup audit log.
- A database-backed orphan-file sweeper.
- Changing custom adapters to require `delete`.
- Replacing the simple storage adapter contract with a larger lifecycle interface.
- Guaranteeing Cloudinary cleanup without signed server credentials.
- Guaranteeing local or memory storage persistence of storage headers.
- A full redesign of the docs site.
- Replacing the existing static site publishing setup.
- Adding a new docs framework.
- Building a hosted dashboard or provider configuration UI.

## Further Notes

The core naming decision is that `headers()` means storage/object upload headers everywhere. CSV file structure should use `columns()` so the API remains guessable and autocomplete stays clean.

The core reliability decision is that Uplift should not return an upload failure while knowingly leaving written objects behind when the configured adapter can delete them. Rollback remains best-effort, but official adapters should support deletion wherever the provider documents it.

Launch readiness is part of the feature, not a follow-up. This work should not be considered complete if only the core package changes. The public site, README, package docs, docs snippets, examples, workflow coverage, changelog, changesets, and release checklist all need to move with the API because the CSV rename is breaking and adapter cleanup behavior has provider-specific credential requirements.

Official provider references used during design:

- AWS S3 uses `DeleteObject` for single-object deletion.
- Cloudflare R2 documents object deletion through S3-compatible `DeleteObjectCommand`.
- Bunny documents file deletion through the storage file `DELETE` endpoint with `AccessKey`.
- Cloudinary documents single-asset deletion through the signed Upload API `destroy` method.
- UploadThing documents server-side file deletion through `deleteFiles`.
