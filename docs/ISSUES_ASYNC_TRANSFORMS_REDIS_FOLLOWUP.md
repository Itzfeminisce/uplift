# Async Transforms Redis Follow-Up Issues

Source review: follow-up review after the Redis acceptance fixes landed.

This file keeps the remaining Redis-specific review findings local. Each item is written as a GitHub-ready issue body, but no remote issue has been created.

## Proposed Breakdown

1. **Fence Redis Transform Job completion by active claim**
   - Type: AFK
   - Blocked by: None
   - User stories covered: concurrent Redis workers, stale worker recovery, idempotent completion

2. **Return quarantined Redis payload failures on first status read**
   - Type: AFK
   - Blocked by: None
   - User stories covered: polling status reads, malformed Redis payload handling

---

## Issue 1: Fence Redis Transform Job Completion By Active Claim

## What to build

Prevent stale Redis workers from committing a Transform Job after their claim lease has expired and another worker has recovered the job. Claiming should produce an active claim identity, and completion or failure should only be allowed for the current claim. A stale worker should not be able to overwrite terminal state, delete another worker's claim, or publish outputs as the authoritative result.

This slice should preserve the current recoverable-lease behavior while adding a fencing guarantee around terminal writes.

## Acceptance criteria

- [ ] A claimed Redis Transform Job carries or is associated with an active claim identity.
- [ ] Completing a Redis Transform Job verifies the caller still owns the active claim.
- [ ] Failing a Redis Transform Job verifies the caller still owns the active claim.
- [ ] A stale worker cannot overwrite a result written by a newer valid claim.
- [ ] A stale worker cannot delete another worker's active claim.
- [ ] Stale completion/failure attempts return or persist a provider-neutral Transform Job failure according to policy.
- [ ] Tests simulate a worker whose claim expires, a second worker reclaiming the job, and the first worker finishing late.
- [ ] Tests cover both stale completion and stale failure attempts.

## Blocked by

- None - can start immediately.

---

## Issue 2: Return Quarantined Redis Payload Failures On First Status Read

## What to build

Make Redis status reads return the quarantined failed Transform Job immediately when a malformed payload is discovered. The first status read that detects invalid JSON or an invalid serialized shape should write the failed placeholder and return that failed job to the status endpoint, rather than surfacing the job as unknown until a later read.

This keeps polling behavior provider-neutral and stable even when Redis contains corrupted job data.

## Acceptance criteria

- [ ] A malformed Redis payload discovered during status read is converted into a failed Transform Job.
- [ ] The same first status read returns the failed Transform Job payload to the caller.
- [ ] The response does not expose raw JSON parse or schema validation details.
- [ ] Subsequent status reads return the same terminal failed job.
- [ ] Worker claim paths continue to avoid executing malformed payloads.
- [ ] Tests cover first-read malformed JSON behavior through the status endpoint.
- [ ] Tests cover first-read wrong-shape payload behavior through the status endpoint.

## Blocked by

- None - can start immediately.
