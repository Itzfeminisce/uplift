# Async Transforms Acceptance Review Issues

Source review: follow-up review after the Redis queue and review-fix changes landed.

This file keeps the latest acceptance gaps local. Each item is written as a GitHub-ready issue body, but no remote issue has been created.

## Proposed Breakdown

1. **Make Redis Transform Job claims atomic and recoverable**
   - Type: AFK
   - Blocked by: None
   - User stories covered: Redis worker execution, concurrent workers, retry/recovery policy

2. **Make Redis enqueue all-or-nothing**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: async upload acceptance, Original Upload lifecycle, queued worker visibility

3. **Add durable Original Upload reads to supported storage adapters**
   - Type: AFK
   - Blocked by: None
   - User stories covered: cross-process worker execution, Local/S3/R2 async transforms

4. **Validate and quarantine malformed Redis job payloads**
   - Type: AFK
   - Blocked by: 1
   - User stories covered: Redis payload safety, provider-neutral Transform Job failures

5. **Strengthen async route contract drift detection**
   - Type: HITL
   - Blocked by: 4
   - User stories covered: deploy compatibility, queued job safety, worker route matching

---

## Issue 1: Make Redis Transform Job Claims Atomic And Recoverable

## What to build

Make Redis-backed Transform Job claiming safe for multiple worker processes. A queued job should be claimed exactly once at a time, status transitions should remain monotonic, and jobs held by crashed or timed-out workers should become recoverable or terminal according to a documented policy.

This slice should define and implement the Redis primitives needed for safe claims, such as a claim token, lease, visibility timeout, retry count, or equivalent atomic script/command sequence.

## Acceptance criteria

- [ ] Claiming a Redis Transform Job is atomic across worker processes.
- [ ] Two workers cannot process the same queued Transform Job concurrently.
- [ ] Direct claim-by-id and claim-next paths share the same concurrency guarantees.
- [ ] A crashed or timed-out worker leaves the job recoverable or terminal according to policy.
- [ ] Worker retries are idempotent by Transform Job id.
- [ ] Status transitions remain monotonic under concurrent workers.
- [ ] Tests simulate competing workers for the same job.
- [ ] Tests cover worker retry after claim timeout or failure.

## Blocked by

- None - can start immediately.

---

## Issue 2: Make Redis Enqueue All-Or-Nothing

## What to build

Make Redis job persistence and queue visibility behave as one atomic enqueue operation after Original Upload storage succeeds. A failed Redis enqueue should return a stable Upload Error, clean up the Original Upload when possible, and avoid leaving a queued or otherwise runnable stale job record.

This slice should cover partial Redis failures around job write, queue push, and any new claim metadata introduced by the Redis claim policy.

## Acceptance criteria

- [ ] Original Upload storage succeeds before a job is visible to workers.
- [ ] Redis job persistence failure returns a provider-neutral Upload Error.
- [ ] Redis enqueue failure returns a provider-neutral Upload Error.
- [ ] Failed enqueue attempts do not leave queued runnable Transform Jobs.
- [ ] Failed enqueue attempts clean up the Original Upload when possible.
- [ ] Queued listeners run only after the job is durably queued.
- [ ] Tests cover Redis job-write failure.
- [ ] Tests cover Redis queue-push failure after job-write success.

## Blocked by

- Blocked by Issue 1.

---

## Issue 3: Add Durable Original Upload Reads To Supported Storage Adapters

## What to build

Make supported storage adapters able to reload Original Upload bytes in a separate async worker process. Local, S3, and R2 storage should implement the storage read capability required by Redis-backed async transforms, while adapters that cannot support reads should fail async transform configuration or upload acceptance clearly.

The worker should not rely on request-memory `File` bodies when using a durable queue.

## Acceptance criteria

- [ ] Local storage can read Original Upload bytes by storage key.
- [ ] S3 storage can read Original Upload bytes by storage key.
- [ ] R2 storage can read Original Upload bytes by storage key.
- [ ] Storage capability requirements for async transforms are explicit in public or internal types.
- [ ] Redis-backed async transforms reject unsupported storage adapters with a clear provider-neutral Upload Error.
- [ ] Missing Original Upload bytes fail the Transform Job with a provider-neutral Upload Error.
- [ ] Tests cover worker execution after request memory has been released for Local storage.
- [ ] Tests cover S3/R2 read behavior using mocked clients.

## Blocked by

- None - can start immediately.

---

## Issue 4: Validate And Quarantine Malformed Redis Job Payloads

## What to build

Validate Redis Transform Job payloads before worker execution and before status reads return data. Malformed JSON, wrong schema versions, invalid timestamps, missing required fields, or corrupted terminal payloads should produce stable provider-neutral failures rather than raw Redis/JSON exceptions.

When a malformed payload has a recoverable job id, mark the job failed or quarantine it according to a documented policy so polling clients can observe a terminal failure.

## Acceptance criteria

- [ ] Redis Transform Job payloads have an explicit serializable schema.
- [ ] Redis payload reads validate required fields before returning a Transform Job.
- [ ] Invalid JSON is converted to a provider-neutral Upload Error.
- [ ] Malformed payloads with a known job id become failed or quarantined according to policy.
- [ ] Status reads do not leak raw parse or validation errors.
- [ ] Worker execution does not start for malformed payloads.
- [ ] Tests cover valid payload round trips.
- [ ] Tests cover invalid JSON and wrong-shape payload failures.

## Blocked by

- Blocked by Issue 1.

---

## Issue 5: Strengthen Async Route Contract Drift Detection

## What to build

Define a stronger compatibility marker for queued async Transform Jobs so workers can detect route contract drift after deploys. The marker should cover changes that affect worker correctness, including route identity, async transform shape, output declarations, and relevant route semantics.

This slice is marked HITL because the project should decide how much transform identity is expected to be stable across deploys and whether users can provide explicit route contract versions.

## Acceptance criteria

- [ ] Transform Job payload includes a route contract version, hash, or equivalent compatibility marker.
- [ ] The compatibility marker detects changed async transform route semantics, not only transform count.
- [ ] Worker validates the queued job against the current Upload Contract before processing.
- [ ] Missing routes fail with a clear provider-neutral Upload Error.
- [ ] Incompatible route contract drift fails with a clear provider-neutral Upload Error.
- [ ] Compatible deploys continue processing queued jobs.
- [ ] Tests cover removed route, changed async transform semantics, changed outputs, and compatible deploys.
- [ ] Docs explain how users should manage route contract compatibility during deploys.

## Blocked by

- Blocked by Issue 4.
