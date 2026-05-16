# Async Transforms Redis Claim Compliance Issues

Source review: compliance review after Redis claim fencing changes landed.

This file keeps the remaining claim-fencing compliance gaps local. Each item is written as a GitHub-ready issue body, but no remote issue has been created.

## Proposed Breakdown

1. **Pass Redis claim identity through all worker failure paths**
   - Type: AFK
   - Blocked by: None
   - User stories covered: route drift failures, missing route failures, Redis worker terminal state

2. **Require active Redis claim ownership for terminal writes**
   - Type: AFK
   - Blocked by: None
   - User stories covered: stale worker fencing, idempotent Redis completion, concurrent worker safety

---

## Issue 1: Pass Redis Claim Identity Through All Worker Failure Paths

## What to build

Ensure every worker path that turns a claimed Redis Transform Job into a terminal failure passes the active claim identity to the queue. Missing routes, route contract drift, malformed claimed jobs with a readable id, and execution-time failures should all persist the intended provider-neutral failed state when the current worker owns the claim.

This should preserve Redis claim fencing without preventing legitimate worker-detected failures from becoming terminal.

## Acceptance criteria

- [ ] Missing-route failures for claimed Redis Transform Jobs persist as terminal failed jobs.
- [ ] Route contract drift failures for claimed Redis Transform Jobs persist as terminal failed jobs.
- [ ] Malformed claimed jobs with a readable id persist as terminal failed jobs when claim ownership is available.
- [ ] Execution-time failures continue to pass claim identity and persist as terminal failed jobs.
- [ ] Failed lifecycle listeners still run only after the job is actually terminal failed.
- [ ] Tests cover missing-route failure with a Redis-backed queue.
- [ ] Tests cover route-contract-drift failure with a Redis-backed queue.
- [ ] Tests prove failed status is visible through the status endpoint after these failures.

## Blocked by

- None - can start immediately.

---

## Issue 2: Require Active Redis Claim Ownership For Terminal Writes

## What to build

Make Redis-backed Transform Job completion and failure require ownership of the active claim whenever a job has been claimed for processing. A no-token caller should not be able to complete or fail a processing job after the claim key expires but before recovery, and stale workers should not be able to commit without a matching current claim identity.

The policy for rejected terminal writes should be provider-neutral and observable without corrupting the current job state.

## Acceptance criteria

- [ ] Redis `complete` rejects or no-ops no-token writes for claimed processing jobs.
- [ ] Redis `fail` rejects or no-ops no-token writes for claimed processing jobs.
- [ ] Expired claim keys do not make no-token terminal writes valid for processing jobs.
- [ ] Queued or unclaimed jobs cannot be moved directly to terminal state without an owned claim unless an explicit policy allows it.
- [ ] Rejected stale/no-token terminal writes do not delete active claim state.
- [ ] Rejected stale/no-token terminal writes do not overwrite newer terminal results.
- [ ] Tests cover no-token completion after claim expiry but before recovery.
- [ ] Tests cover no-token failure after claim expiry but before recovery.

## Blocked by

- None - can start immediately.
