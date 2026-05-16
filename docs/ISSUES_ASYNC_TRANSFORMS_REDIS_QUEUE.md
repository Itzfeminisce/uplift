# Async Transforms Redis Queue Issue Breakdown

Source review: deeper async transforms review against the intended Redis-backed worker contract.

This file keeps Redis queue follow-up work local. Each item is written as a GitHub-ready issue body, but no remote issue has been created.

## Proposed Breakdown

1. **Define the Redis async transform queue contract**
   - Type: HITL
   - Blocked by: None
   - User stories covered: 21-26, 29-30, 36

2. **Persist Transform Jobs and status in Redis**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: 1, 6-8, 21, 25-26, 29-30

3. **Enqueue async uploads atomically after Original Upload storage**
   - Type: AFK
   - Blocked by: 1, 2
   - User stories covered: 1, 5-8, 18-21, 25, 30

4. **Claim Redis Transform Jobs safely across workers**
   - Type: AFK
   - Blocked by: 2, 3
   - User stories covered: 1, 21, 25-26, 30

5. **Make Original Upload reads available to Redis workers**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: 18-20, 25, 27, 30

6. **Serialize and validate Redis Transform Job payloads**
   - Type: AFK
   - Blocked by: 1, 2
   - User stories covered: 23-26, 30, 36

7. **Detect upload contract drift during worker execution**
   - Type: AFK
   - Blocked by: 2, 6
   - User stories covered: 25-26, 30

8. **Apply root async transform defaults to jobs**
   - Type: AFK
   - Blocked by: 1, 2
   - User stories covered: 21-24, 30

---

## Issue 1: Define The Redis Async Transform Queue Contract

## What to build

Define the public and internal contract for Redis-backed async transforms. The root `asyncTransforms` config should describe the Redis connection, queue name, default timeout, and Original Upload retention policy without leaking Redis internals into unrelated upload routes.

This slice should settle package boundaries, dependency ownership, and the minimal queue abstraction that the upload request path, worker runner, status reads, tests, and docs all use.

## Acceptance criteria

- [ ] `asyncTransforms` exposes a typed Redis connection or queue adapter configuration.
- [ ] `asyncTransforms` exposes a queue name.
- [ ] `asyncTransforms` exposes a root default timeout.
- [ ] `asyncTransforms.keepOriginal` keeps its existing retention semantics.
- [ ] The core package boundary for Redis dependencies is explicit.
- [ ] Non-async users do not need Redis configuration or Redis runtime dependencies.
- [ ] Type tests cover required async queue config when async routes exist.
- [ ] Docs show the intended Redis-backed worker setup.

## Blocked by

- None - can start immediately.

---

## Issue 2: Persist Transform Jobs And Status In Redis

## What to build

Move Transform Job state and status reads from process-local memory to the configured Redis-backed queue storage. A web process that accepts an async upload, a separate worker process, and another web process serving `transform.done()` polling should all observe the same Transform Job state.

The existing in-memory store can remain only as a test helper or explicit local development adapter if that boundary is documented.

## Acceptance criteria

- [ ] Upload acceptance writes queued Transform Job state to Redis-backed storage.
- [ ] Worker execution reads Transform Job state from Redis-backed storage.
- [ ] `GET ?job=<id>` reads status from Redis-backed storage.
- [ ] A different app/server instance can read a job created by another instance.
- [ ] Terminal result and failure details are persisted for later polling.
- [ ] In-memory job storage is not used as the production async transform source of truth.
- [ ] Tests cover cross-instance status reads.

## Blocked by

- Blocked by Issue 1.

---

## Issue 3: Enqueue Async Uploads Atomically After Original Upload Storage

## What to build

Make async upload acceptance atomic across Original Upload storage and Redis job enqueueing. A successful upload acceptance should mean the Original Upload exists, the Transform Job is persisted, and work is queued. A failure in any part should return a stable Upload Error and avoid creating runnable orphaned work.

This should also define compensation for Redis enqueue failures after the Original Upload has already been written.

## Acceptance criteria

- [ ] Original Upload storage succeeds before a job is visible to workers.
- [ ] Redis job persistence failure returns a provider-neutral Upload Error.
- [ ] Redis enqueue failure returns a provider-neutral Upload Error.
- [ ] Failed enqueue attempts do not leave queued runnable Transform Jobs.
- [ ] Failed enqueue attempts clean up the Original Upload when possible.
- [ ] `queued` listeners run only after the job is durably queued.
- [ ] Tests cover storage failure, Redis persistence failure, and Redis enqueue failure.

## Blocked by

- Blocked by Issue 1.
- Blocked by Issue 2.

---

## Issue 4: Claim Redis Transform Jobs Safely Across Workers

## What to build

Replace local `listQueued()[0]` worker selection with a distributed-safe Redis claim model. Multiple workers should be able to run concurrently without processing the same Transform Job twice, while failed or crashed workers should leave jobs recoverable according to a documented retry or visibility-timeout policy.

The worker should preserve monotonic Transform Job status transitions and idempotent completion behavior.

## Acceptance criteria

- [ ] Worker claim is atomic across multiple worker processes.
- [ ] Two workers cannot process the same queued Transform Job concurrently.
- [ ] A crashed or timed-out worker leaves the job recoverable or terminal according to policy.
- [ ] Worker retries are idempotent by Transform Job id.
- [ ] Status transitions remain monotonic under concurrent workers.
- [ ] Tests simulate competing workers for the same job.
- [ ] Tests cover worker retry after claim timeout or failure.

## Blocked by

- Blocked by Issue 2.
- Blocked by Issue 3.

---

## Issue 5: Make Original Upload Reads Available To Redis Workers

## What to build

Ensure Redis workers can load Original Upload bytes after request memory is gone. The storage abstraction or async transform subsystem must provide a durable byte-read path for every storage adapter that supports async transforms.

Adapters that cannot support async worker reads should fail configuration clearly rather than accepting async routes that can never process.

## Acceptance criteria

- [ ] Storage capability requirements for async transforms are explicit.
- [ ] Local storage can read Original Upload bytes in a worker process.
- [ ] S3 storage can read Original Upload bytes in a worker process.
- [ ] R2 storage can read Original Upload bytes in a worker process.
- [ ] Adapters without read support reject async transform usage clearly.
- [ ] Missing Original Upload bytes fail the Transform Job with a provider-neutral Upload Error.
- [ ] Tests cover worker execution after request memory has been released for supported adapters.

## Blocked by

- Blocked by Issue 1.

---

## Issue 6: Serialize And Validate Redis Transform Job Payloads

## What to build

Define an explicit Redis-serializable Transform Job payload shape. Captured route, file facts, Original Upload reference, auth context, metadata, timeout, retention policy, timestamps, and status/result/error data should be serializable, versioned, and validated when read.

Non-serializable auth or metadata should fail during upload acceptance with a clear error before a worker sees the job.

## Acceptance criteria

- [ ] Transform Job payload has an explicit serializable schema.
- [ ] Job timestamps serialize and deserialize consistently.
- [ ] Captured `user` and `metadata` must be JSON-serializable or otherwise explicitly encoded.
- [ ] Non-serializable captured data fails upload acceptance clearly.
- [ ] Redis payload reads validate shape before worker execution.
- [ ] Malformed Redis payloads fail jobs with provider-neutral Upload Errors.
- [ ] Tests cover valid payload round trips and malformed payload failures.

## Blocked by

- Blocked by Issue 1.
- Blocked by Issue 2.

---

## Issue 7: Detect Upload Contract Drift During Worker Execution

## What to build

Detect when a queued Transform Job no longer matches the deployed Upload Contract used by the worker. Jobs should include enough route contract identity to fail clearly when route names, async transform shape, output declarations, or relevant route semantics drift between upload acceptance and worker execution.

The worker should not silently run a job against an incompatible route definition.

## Acceptance criteria

- [ ] Transform Job payload includes a route contract version, hash, or equivalent compatibility marker.
- [ ] Worker validates the queued job against the current Upload Contract before processing.
- [ ] Missing routes fail with a clear provider-neutral Upload Error.
- [ ] Incompatible route contract drift fails with a clear provider-neutral Upload Error.
- [ ] Compatible deploys continue processing queued jobs.
- [ ] Tests cover removed route, changed async transform route, and changed outputs.

## Blocked by

- Blocked by Issue 2.
- Blocked by Issue 6.

---

## Issue 8: Apply Root Async Transform Defaults To Jobs

## What to build

Apply root async transform defaults when creating Transform Jobs. Per-route overrides should still win, but jobs without route overrides should inherit root timeout and queue behavior from `asyncTransforms`.

This closes the gap where a route can omit timeout and produce a job that runs forever despite root async transform configuration.

## Acceptance criteria

- [ ] Root `asyncTransforms.timeout` is accepted and typed.
- [ ] Jobs inherit root timeout when route timeout is absent.
- [ ] Per-route timeout overrides root timeout.
- [ ] Jobs cannot run forever unless explicitly configured to do so.
- [ ] Timeout values are validated before enqueueing.
- [ ] Type tests cover root timeout and route override combinations.
- [ ] Runtime tests cover inherited timeout behavior.

## Blocked by

- Blocked by Issue 1.
- Blocked by Issue 2.
