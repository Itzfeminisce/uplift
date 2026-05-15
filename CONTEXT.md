# Uplift Context

Uplift is a TypeScript-first upload library centered on a server-defined upload contract that produces typed client upload methods. This context captures the domain language used to keep core upload behavior, framework entrypoints, and provider boundaries distinct.

## Language

**Upload Contract**:
The server-defined route contract that determines accepted files, auth context, storage behavior, completion behavior, and typed client method shapes.
_Avoid_: Upload API, client API

**Framework Adapter**:
A package that translates a web framework's request and response shape into Uplift's framework-neutral upload handler.
_Avoid_: Integration, plugin

**Client Operation Control**:
A frontend control exposed on a route-named upload method for managing that route's current or most recent upload attempt.
_Avoid_: Route builder method, server control

**Upload Attempt**:
A single client-side execution of a route-named upload method with a specific file input.
_Avoid_: Upload route, upload contract

**Route Manifest**:
A static, serializable description of route capabilities that clients and documentation generators can read.
_Avoid_: Runtime validation result, live route state

**Preflight Check**:
A point-in-time server eligibility check for a specific file input before an upload attempt begins.
_Avoid_: Realtime validation, guaranteed upload success

**Upload Error Code**:
A stable, provider-neutral category that explains why an upload operation failed.
_Avoid_: Provider error code, raw exception name

## Relationships

- An **Upload Contract** is exposed through one or more **Framework Adapters**.
- A **Route Manifest** describes static capabilities of an **Upload Contract** without running app-specific upload behavior.
- A **Framework Adapter** does not own storage, auth policy, UI, or upload route behavior.
- A **Framework Adapter** exposes framework-native handlers that delegate upload `POST` requests to the framework-neutral upload handler.
- A **Framework Adapter** uses `HEAD` for health, `GET` for the public **Route Manifest**, and `POST` for an **Upload Attempt**.
- A **Client Operation Control** manages an **Upload Attempt** without changing the **Upload Contract**.
- `abort()` cancels only the currently in-flight **Upload Attempt** for that route method and is a no-op when no attempt is active.
- `retry()` repeats only the most recent failed or aborted **Upload Attempt** for that route method, using the original file input.
- `retry()` remembers the original file input only for the lifetime of the client or React hook instance.
- Only one **Upload Attempt** may be active for a route method at a time; starting a new attempt for the same route aborts the previous one.
- A **Preflight Check** runs auth, static route constraints, and explicit preflight hooks; the later **Upload Attempt** must still validate again.
- A route builder may define an explicit `.preflight(handler)` hook for app-specific **Preflight Check** eligibility.
- A `.preflight(handler)` hook returns `true` for eligibility or a string message for ineligibility.
- A `.preflight(handler)` hook receives file facts only, not file bytes or streams.
- A successful client **Preflight Check** may expose `upload()` as a convenience continuation, while direct route calls such as `upload.avatar(file)` remain the primary upload path.
- The public **Route Manifest** includes only non-sensitive static route capabilities.
- OpenAPI output should be generated from the **Route Manifest**, not from arbitrary runtime hooks, and should live in a separate package from core.
- **Upload Error Codes** should be specific enough for UI branching while avoiding provider-specific categories.
- Public README and site documentation should describe features only after they are implemented.

## Example dialogue

> **Dev:** "Should the Fastify package decide how auth works?"
> **Domain expert:** "No. A **Framework Adapter** only exposes the **Upload Contract** through Fastify's request and response model."

> **Dev:** "Should `GET /upload` remain a health check?"
> **Domain expert:** "No. `HEAD /upload` is health; `GET /upload` returns the public **Route Manifest**."

> **Dev:** "Does `upload.avatar.abort()` belong on the server route?"
> **Domain expert:** "No. `abort()` is a **Client Operation Control** for the current browser-side upload attempt."

> **Dev:** "If `upload.avatar.abort()` is called while `upload.gallery()` is running, should gallery stop too?"
> **Domain expert:** "No. Each **Upload Attempt** belongs to one route-named method."

> **Dev:** "Should `upload.avatar.retry()` run after a successful avatar upload?"
> **Domain expert:** "No. `retry()` only repeats a failed or aborted **Upload Attempt**."

> **Dev:** "Should retry survive a page reload?"
> **Domain expert:** "No. `retry()` is an ephemeral **Client Operation Control**, not resumable upload storage."

> **Dev:** "Can `upload.avatar(fileA)` and `upload.avatar(fileB)` run at the same time?"
> **Domain expert:** "No. A route method has at most one active **Upload Attempt**, so the newer attempt replaces the older one."

> **Dev:** "Does `upload.avatar.preflight(file)` guarantee the upload will succeed?"
> **Domain expert:** "No. A **Preflight Check** is point-in-time eligibility; the real **Upload Attempt** still validates before storage."

> **Dev:** "Does `check.upload()` replace `upload.avatar(file)`?"
> **Domain expert:** "No. Direct route calls remain the primary upload path; `check.upload()` is a convenience continuation after a successful **Preflight Check**."

> **Dev:** "Should custom pre-upload business rules live in `.validate()`?"
> **Domain expert:** "No. Use `.preflight(handler)` when the rule belongs to the **Preflight Check** before file bytes are uploaded."

> **Dev:** "Should OpenAPI document every custom validation branch?"
> **Domain expert:** "No. OpenAPI is generated from the **Route Manifest**, which describes the static upload contract."

> **Dev:** "Should core generate full OpenAPI documents?"
> **Domain expert:** "No. Core exposes the **Route Manifest**; an OpenAPI package turns that manifest into OpenAPI."

> **Dev:** "Should the site describe preflight before it ships?"
> **Domain expert:** "No. Repo context and ADRs can lead implementation, but public docs should describe shipped behavior."

> **Dev:** "Can the manifest include storage bucket names or key patterns?"
> **Domain expert:** "No. The public **Route Manifest** exposes only non-sensitive static route capabilities."

> **Dev:** "Should a Cloudinary failure get a Cloudinary-specific error code?"
> **Domain expert:** "No. Use a provider-neutral **Upload Error Code** such as `STORAGE_FAILED` and keep provider details in the message or cause."

## Flagged ambiguities

- "adapter" can mean a **Framework Adapter** or a storage adapter; use the fuller term when the boundary matters.
- "preflight" is advisory and point-in-time; it is not realtime validation and does not guarantee a future upload attempt will succeed.
