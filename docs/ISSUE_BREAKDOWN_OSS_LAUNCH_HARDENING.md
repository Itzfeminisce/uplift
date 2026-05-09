# Uplift OSS Launch Hardening Issue Breakdown

This draft follows the `to-issues` tracer-bullet workflow. Each issue should deliver a verifiable slice toward a safer `0.1.0` release.

## Parent PRD

- #23 - https://github.com/Itzfeminisce/uplift/issues/23

## Proposed Slices

1. **Dogfood local example app**
   - Type: AFK
   - Blocked by: None
   - User stories covered: 1, 2, 5, 6, 7, 8, 9, 30
   - What to build: Add a real example app that uses Uplift through the workspace package and demonstrates avatar, gallery, public, and authenticated upload flows with local storage.

2. **Example cloud configuration path**
   - Type: AFK
   - Blocked by: Dogfood local example app
   - User stories covered: 3, 4
   - What to build: Extend the example docs/configuration to show S3/R2 environment variables and storage setup without requiring cloud credentials for the default path.

3. **Docs sample validation**
   - Type: AFK
   - Blocked by: Dogfood local example app
   - User stories covered: 10, 11, 30
   - What to build: Add tooling that typechecks or lints README/site code samples by sourcing them from tested example files or validating extracted snippets.

4. **Bundle-size reporting**
   - Type: AFK
   - Blocked by: None
   - User stories covered: 12, 13
   - What to build: Add repo-owned bundle-size measurement and surface the result in README/docs without relying on Bundlephobia.

5. **Dark-first docs site with light toggle**
   - Type: HITL
   - Blocked by: Bundle-size reporting
   - User stories covered: 13, 14, 15, 16
   - What to build: Redesign the GitHub Pages docs site as dark-by-default, add a persistent light-mode toggle, and display package stats and bundle-size information cleanly.

6. **Comparison and positioning docs**
   - Type: HITL
   - Blocked by: Dark-first docs site with light toggle
   - User stories covered: 17, 18, 29
   - What to build: Add an honest comparison page/section covering UploadThing, Uppy, FilePond, and direct storage SDK uploads, with Uplift's recommended use cases and non-goals.

7. **UploadThing adapter**
   - Type: AFK
   - Blocked by: Dogfood local example app
   - User stories covered: 19, 20
   - What to build: Add UploadThing as an isolated adapter/integration with tests and docs, without adding it as a core dependency.

8. **Failure-mode test expansion**
   - Type: AFK
   - Blocked by: Dogfood local example app
   - User stories covered: 21, 22, 23, 24, 25, 26
   - What to build: Expand runtime/framework tests for malformed multipart, auth failures, storage failures, unsafe keys, multi-file failure semantics, and documented framework behavior.

9. **Package install smoke test**
   - Type: AFK
   - Blocked by: Bundle-size reporting
   - User stories covered: 27
   - What to build: Add CI/script that packs Uplift, installs it into a clean temporary project, and imports the public subpaths.

10. **0.1.0 release checklist**
    - Type: HITL
    - Blocked by: Docs sample validation, Dark-first docs site with light toggle, Comparison and positioning docs, UploadThing adapter, Failure-mode test expansion, Package install smoke test
    - User stories covered: 28, 29
    - What to build: Add a launch checklist and release notes draft for `0.1.0`, explicitly marking Uplift as early OSS and documenting what is stable versus experimental.

## Questions Before Filing GitHub Issues

1. Does this granularity feel right?
2. Should the docs site redesign and comparison docs remain HITL, or should they be AFK?
3. Should UploadThing adapter block `0.1.0`, or can it ship after the first npm publish?
4. Should the first dogfood example be Next.js + local storage, or a smaller framework-neutral example?

## Draft Issue Bodies

### 1. Dogfood local example app

## What to build

Add a real example application that uses Uplift through the workspace package and demonstrates the launch-critical upload flows with local storage by default.

## Acceptance criteria

- [ ] The example can be installed and run from the repo.
- [ ] The example demonstrates a single avatar upload.
- [ ] The example demonstrates a multi-file gallery upload.
- [ ] The example demonstrates an authenticated route.
- [ ] The example demonstrates a public route.
- [ ] The example shows React hook state/progress/errors.
- [ ] CI or a script verifies the example builds or typechecks.

## Blocked by

None - can start immediately.

### 2. Example cloud configuration path

## What to build

Extend the example with documented S3 and R2 configuration paths while keeping local storage as the default no-credentials path.

## Acceptance criteria

- [ ] S3 environment variables are documented.
- [ ] R2 environment variables are documented.
- [ ] The default example still works without cloud credentials.
- [ ] Docs explain how to switch storage providers.

## Blocked by

Blocked by issue 1.

### 3. Docs sample validation

## What to build

Add tooling that keeps README/site code samples aligned with the public API.

## Acceptance criteria

- [ ] Code samples are sourced from checked example files or extracted into a validation script.
- [ ] CI fails when a documented TypeScript sample no longer typechecks.
- [ ] README and site samples are covered by the validation path.

## Blocked by

Blocked by issue 1.

### 4. Bundle-size reporting

## What to build

Add repo-owned bundle-size measurement and surface reliable size information in docs.

## Acceptance criteria

- [ ] A script reports bundle size for core and important subpaths.
- [ ] CI runs or records the bundle-size check.
- [ ] README/docs display generated bundle-size information without using Bundlephobia.

## Blocked by

None - can start immediately.

### 5. Dark-first docs site with light toggle

## What to build

Redesign the GitHub Pages documentation site as dark-by-default with a persistent light-mode toggle and polished package-stat presentation.

## Acceptance criteria

- [ ] Dark theme is the default.
- [ ] Light theme can be toggled.
- [ ] Theme preference persists locally.
- [ ] The docs site is responsive on mobile and desktop.
- [ ] npm stats and bundle-size information are presented without broken badges.

## Blocked by

Blocked by issue 4.

### 6. Comparison and positioning docs

## What to build

Add honest comparison/positioning documentation that explains where Uplift fits relative to UploadThing, Uppy, FilePond, and direct storage SDKs.

## Acceptance criteria

- [ ] Comparison covers UploadThing.
- [ ] Comparison covers Uppy.
- [ ] Comparison covers FilePond.
- [ ] Comparison covers direct provider SDK uploads.
- [ ] Copy explains Uplift's strengths without claiming it is universally better.

## Blocked by

Blocked by issue 5.

### 7. UploadThing adapter

## What to build

Add UploadThing support as an isolated adapter/integration, with tests and documentation, without making it a core dependency.

## Acceptance criteria

- [ ] UploadThing integration is exposed through a separate subpath or adapter boundary.
- [ ] Core does not import UploadThing.
- [ ] Tests verify the adapter calls the expected UploadThing-compatible boundary.
- [ ] Docs show when to choose UploadThing integration versus native storage adapters.

## Blocked by

Blocked by issue 1.

### 8. Failure-mode test expansion

## What to build

Expand test coverage around the high-risk runtime and framework behavior.

## Acceptance criteria

- [ ] Malformed multipart requests are tested.
- [ ] Auth failures are tested.
- [ ] Storage failures are tested.
- [ ] Unsafe key handling is tested.
- [ ] Multi-file partial failure semantics are tested.
- [ ] Documented framework behavior is tested.

## Blocked by

Blocked by issue 1.

### 9. Package install smoke test

## What to build

Add a clean-install smoke test for the packed package.

## Acceptance criteria

- [ ] CI packs Uplift.
- [ ] CI installs the tarball into a temporary project.
- [ ] The smoke project imports the root package and major subpaths.
- [ ] The smoke project typechecks or runs a minimal script.

## Blocked by

Blocked by issue 4.

### 10. 0.1.0 release checklist

## What to build

Add a `0.1.0` release checklist and release-notes draft that describe launch readiness, stability expectations, and remaining experimental areas.

## Acceptance criteria

- [ ] Checklist includes example app verification.
- [ ] Checklist includes docs sample validation.
- [ ] Checklist includes bundle-size verification.
- [ ] Checklist includes package smoke test verification.
- [ ] Release notes label Uplift as early OSS/pre-1.0.

## Blocked by

Blocked by issues 3, 5, 6, 7, 8, and 9.
