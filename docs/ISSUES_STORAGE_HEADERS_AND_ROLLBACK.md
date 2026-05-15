# Storage Headers and Rollback Issue Breakdown

Source PRD: `docs/PRD_STORAGE_HEADERS_AND_ROLLBACK.md`

This file keeps the issue plan local. Each item is written as a GitHub-ready issue body, but no remote issue has been created yet.

## Proposed Breakdown

1. **Add shared storage headers and CSV columns to core**
   - Type: AFK
   - Blocked by: None
   - User stories covered: 1-19, 27-28, 38-40

2. **Rollback every written object on request failure**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: 29-34, 37

3. **Implement S3 and R2 header/delete support**
   - Type: AFK
   - Blocked by: 1, 2
   - User stories covered: 20-21, 35-37, 43

4. **Implement Bunny header/delete support**
   - Type: AFK
   - Blocked by: 1, 2
   - User stories covered: 22, 35-37, 43

5. **Implement UploadThing delete support**
   - Type: AFK
   - Blocked by: 2
   - User stories covered: 26, 35-37, 43

6. **Implement Cloudinary cleanup credential path**
   - Type: AFK
   - Blocked by: 2
   - User stories covered: 23-25, 35-37, 43-44

7. **Document storage headers, CSV columns, and rollback**
   - Type: AFK
   - Blocked by: 1, 2, 3, 4, 5, 6
   - User stories covered: 39-45

8. **Update static docs site for launch**
   - Type: AFK
   - Blocked by: 7
   - User stories covered: 41, 44-46

9. **Harden verification workflows and examples**
   - Type: AFK
   - Blocked by: 7, 8
   - User stories covered: 45-48

10. **Prepare release checklist, changelog, and changeset**
    - Type: AFK
    - Blocked by: 8, 9
    - User stories covered: 49-50

## Questions Before Filing GitHub Issues

1. Does this granularity feel right, or should provider adapter work be grouped into fewer issues?
2. Are all slices correctly marked AFK, or should Cloudinary be HITL because credential shape and deletion signing may need review?
3. Should docs/site work wait for every adapter, or should it begin after the core API and one adapter prove the model?

---

## Issue 1: Add Shared Storage Headers And CSV Columns To Core

## What to build

Add the public route-builder API and core route definition changes for storage/object headers and CSV column validation. `headers()` should become a shared builder method on every upload primitive and should mean storage headers everywhere. CSV file structure should move to `columns()`, with delimiter support through both `columns(..., { delimiter })` and the existing `delimiter()` chain.

This slice should prove the naming and type model end-to-end using the core test adapter. It should not depend on provider-specific adapters.

## Acceptance criteria

- [x] `headers()` is available on every public route builder.
- [x] `headers()` accepts static storage headers.
- [x] `headers()` accepts a dynamic function using request, file, user, and metadata context.
- [x] Dynamic headers are inferred after `auth()` and `meta()` chaining.
- [x] `headers()` preserves narrowed builder methods after chaining.
- [x] Route definitions store storage headers separately from CSV file structure.
- [x] `StoragePutInput` includes resolved storage headers.
- [x] The server passes resolved headers to primary `storage.put()`.
- [x] The server passes route-level resolved headers to output `storage.put()` calls by default.
- [x] `csv().columns([...])` configures CSV column validation.
- [x] `csv().columns([...], { delimiter })` configures columns and delimiter together.
- [x] `csv().delimiter(...)` remains supported.
- [x] Last delimiter configuration wins.
- [x] `csv().headers([...])` no longer represents CSV column validation.
- [x] Type tests cover every route builder exposing `headers()`.
- [x] Type tests cover dynamic header context inference.
- [x] Runtime tests cover static headers, dynamic headers, output headers, CSV columns, delimiter options, and last-call-wins delimiter behavior.

## Blocked by

None - can start immediately.

---

## Issue 2: Roll Back Every Written Object On Request Failure

## What to build

Update upload request handling so Uplift tracks every object written during a request and attempts to delete all written objects if the request ultimately returns a failure. Rollback should apply to failures from output generation, route completion handlers, and global completion handlers. Rollback errors should not replace the original upload error.

This slice should use local test adapters and should not depend on provider-specific delete implementations.

## Acceptance criteria

- [x] The server tracks every successfully written object key during an upload request.
- [x] Output failure rolls back the primary object and any earlier outputs.
- [x] `done()` failure rolls back the primary object and outputs.
- [x] `onUploadComplete()` failure rolls back the primary object and outputs.
- [x] Multi-file route failure rolls back all objects written before failure.
- [x] Rollback does not run after a successful response.
- [x] Rollback uses `storage.delete` when the adapter provides it.
- [x] Missing `storage.delete` does not crash the original failure path.
- [x] Rollback delete failures do not replace the original upload error.
- [x] Runtime tests cover output failure, `done()` failure, `onUploadComplete()` failure, multi-file partial failure, missing delete, and delete failure.

## Blocked by

- Blocked by Issue 1.

---

## Issue 3: Implement S3 And R2 Header/Delete Support

## What to build

Update the S3-compatible storage path so Uplift storage headers are translated to supported S3 object parameters and official S3/R2 adapters can delete objects during rollback. R2 should remain a thin S3-compatible adapter and should inherit the same behavior.

## Acceptance criteria

- [x] S3 `put` maps supported storage headers to S3 object upload parameters.
- [x] S3 preserves existing content type behavior.
- [x] S3 rejects or ignores unsupported unsafe headers according to the chosen core/header policy.
- [x] S3 implements `delete(key)` using the provider's single-object delete API.
- [x] S3 delete failures are wrapped as upload/storage errors consistently with existing adapter behavior.
- [x] R2 passes storage headers through to the S3-compatible adapter.
- [x] R2 exposes delete behavior through the S3-compatible adapter.
- [x] Adapter tests verify S3 upload command parameters include supported headers.
- [x] Adapter tests verify S3 delete command receives bucket and key.
- [x] Adapter tests verify R2 delegates put and delete through the S3-compatible path.
- [x] Adapter docs mention rollback cleanup support for S3 and R2.

## Blocked by

- Blocked by Issue 1.
- Blocked by Issue 2.

---

## Issue 4: Implement Bunny Header/Delete Support

## What to build

Update the Bunny adapter so supported storage headers are included in upload requests without allowing users to override adapter authentication, and add delete support using Bunny's documented storage file deletion endpoint.

## Acceptance criteria

- [x] Bunny `put` includes supported route storage headers.
- [x] Bunny preserves required `AccessKey` authentication.
- [x] Bunny preserves existing content type behavior.
- [x] Bunny prevents route headers from overriding protected adapter headers.
- [x] Bunny implements `delete(key)` through the documented storage file delete endpoint.
- [x] Bunny delete uses the same storage zone and storage hostname configuration as upload.
- [x] Adapter tests verify upload headers are merged safely.
- [x] Adapter tests verify protected headers cannot be overridden by route headers.
- [x] Adapter tests verify delete calls the expected URL, method, and `AccessKey`.
- [x] Adapter docs mention rollback cleanup support and required credentials.

## Blocked by

- Blocked by Issue 1.
- Blocked by Issue 2.

---

## Issue 5: Implement UploadThing Delete Support

## What to build

Extend the UploadThing adapter so official rollback can delete uploaded files. Keep the adapter plain and testable by accepting an injected deletion function or provider helper that maps to UploadThing's server-side file deletion API.

This slice is focused on cleanup. Storage headers may be documented as unsupported or provider-specific unless a safe UploadThing mapping is available.

## Acceptance criteria

- [x] UploadThing adapter exposes a delete path through injected provider behavior.
- [x] Delete accepts the stored file key used by Uplift rollback.
- [x] Delete maps to UploadThing's documented server-side file deletion behavior.
- [x] Existing UploadThing upload behavior remains compatible.
- [x] Adapter tests verify delete calls the configured deletion boundary.
- [x] Adapter tests verify upload still passes the full `StoragePutInput` to the uploader.
- [x] Adapter docs explain how to configure delete support.
- [x] Adapter docs explain whether storage headers are supported, ignored, or passed through.

## Blocked by

- Blocked by Issue 2.

---

## Issue 6: Implement Cloudinary Cleanup Credential Path

## What to build

Add Cloudinary cleanup support for rollback while keeping unsigned uploads simple. Unsigned uploads should continue to work with `cloudName` and `uploadPreset`; deletion should be enabled when server-side signed credentials are configured. The adapter should call Cloudinary's signed single-asset deletion path and document the credential requirement clearly.

Storage headers should be mapped only where Cloudinary has a safe and documented upload-parameter equivalent; unsupported headers should be documented rather than silently implying full object-storage parity.

## Acceptance criteria

- [x] Existing unsigned Cloudinary upload setup still works.
- [x] Cloudinary options accept server-side credentials needed for signed deletion.
- [x] Cloudinary implements `delete(key)` when signed credentials are present.
- [x] Cloudinary delete uses the correct public identifier from uploaded results.
- [x] Cloudinary delete handles relevant resource types for supported uploads.
- [x] Cloudinary delete can request CDN invalidation if included in the chosen option shape.
- [x] Missing signed credentials produce a clear cleanup limitation, not a broken upload path.
- [x] Adapter tests cover unsigned upload without delete credentials.
- [x] Adapter tests cover signed delete request construction.
- [x] Adapter docs and site docs explain unsigned upload versus signed cleanup credentials.
- [x] Adapter docs explain which storage headers, if any, Cloudinary supports.

## Blocked by

- Blocked by Issue 2.

---

## Issue 7: Document Storage Headers, CSV Columns, And Rollback

## What to build

Update developer documentation for the new route API, CSV migration, storage adapter contract, and rollback behavior. Documentation should make the naming change explicit: `headers()` means storage/object headers everywhere, while CSV file structure uses `columns()`.

## Acceptance criteria

- [x] Root README includes a concise `headers()` example.
- [x] Root README includes a concise `csv().columns()` example.
- [x] Core package docs explain static and dynamic storage headers.
- [x] Core package docs explain that route headers apply to outputs by default.
- [x] Core package docs explain CSV `columns()` and delimiter options.
- [x] Migration docs show `csv().headers([...])` becoming `csv().columns([...])`.
- [x] Storage adapter docs explain optional custom-adapter `delete`.
- [x] Official adapter docs explain cleanup support and credential requirements.
- [x] Cloudinary docs explain unsigned upload versus signed cleanup credentials.
- [x] UploadThing docs explain delete configuration.
- [x] Docs snippets are added or updated for shared headers and CSV columns.
- [x] `pnpm docs:check` verifies the new snippets.

## Blocked by

- Blocked by Issue 1.
- Blocked by Issue 2.
- Blocked by Issue 3.
- Blocked by Issue 4.
- Blocked by Issue 5.
- Blocked by Issue 6.

---

## Issue 8: Update Static Docs Site For Launch

## What to build

Update the static documentation site so storage headers, CSV columns, and rollback behavior are visible in the public product narrative. The site should keep the current static publishing model and should not turn into a full redesign.

## Acceptance criteria

- [x] Site includes a route example using shared `headers()`.
- [x] Site includes a CSV example using `columns()`.
- [x] Site explains storage headers as route-level object storage behavior.
- [x] Site explains rollback cleanup and optional custom-adapter delete support.
- [x] Site includes adapter cleanup notes or links to package docs.
- [x] Site explains Cloudinary signed cleanup credential requirements.
- [x] Site no longer shows CSV `headers()` as file-column validation.
- [x] Site remains responsive and visually consistent with existing design.
- [x] Site remains static and publishable through the existing Pages workflow.
- [x] Any shown bundle-size or package data is regenerated if implementation changes it.

## Blocked by

- Blocked by Issue 7.

---

## Issue 9: Harden Verification Workflows And Examples

## What to build

Make sure local verification, examples, docs snippets, CI, Pages, release, and smoke-pack coverage are ready for this feature. This slice should close the gap between "implemented locally" and "safe to launch".

## Acceptance criteria

- [x] Existing examples are updated if they show CSV `headers()` or should demonstrate storage headers.
- [x] `pnpm docs:check` covers storage-header and CSV-column snippets.
- [x] `pnpm examples:check` passes after example updates.
- [x] `pnpm smoke:pack` verifies packed packages after builder, type, and adapter changes.
- [x] `pnpm bundle:size` is run and committed if docs or site data depend on it.
- [x] CI workflow runs the verification commands required for this launch.
- [x] Pages workflow still publishes the static site directory.
- [x] Release workflow still publishes affected packages with correct files and subpath exports.
- [x] Local release verification command list is documented in the release checklist or docs.

## Blocked by

- Blocked by Issue 7.
- Blocked by Issue 8.

---

## Issue 10: Prepare Release Checklist, Changelog, And Changeset

## What to build

Prepare the feature for release by updating the launch checklist, changelog, and changesets. The release notes must call out the breaking CSV rename, shared storage headers, official adapter delete support, Cloudinary credential requirements, and rollback behavior.

## Acceptance criteria

- [x] Release checklist includes core API verification.
- [x] Release checklist includes official adapter delete verification.
- [x] Release checklist includes docs snippet verification.
- [x] Release checklist includes examples verification.
- [x] Release checklist includes static site verification.
- [x] Release checklist includes CI, Pages, release workflow, bundle-size, build, and smoke-pack verification.
- [x] Changelog documents `headers()` becoming storage headers across builders.
- [x] Changelog documents `csv().columns()` replacing CSV `headers()` for file-column validation.
- [x] Changelog documents adapter delete support and rollback behavior.
- [x] Changelog documents Cloudinary signed cleanup credential requirements.
- [x] Changesets are prepared for affected packages.
- [x] Package versions are updated if this repo's release process requires direct version bumps.

## Blocked by

- Blocked by Issue 8.
- Blocked by Issue 9.
