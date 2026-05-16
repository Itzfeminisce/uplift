# Async Transforms Redis Output Cleanup Issue

Source review: compliance review after Redis claim ownership changes landed.

This file keeps the remaining output-cleanup finding local. The item is written as a GitHub-ready issue body, but no remote issue has been created.

## Proposed Breakdown

1. **Clean up outputs when Redis completion loses claim ownership**
   - Type: AFK
   - Blocked by: None
   - User stories covered: stale worker fencing, storage rollback, Redis worker idempotency

---

## Issue 1: Clean Up Outputs When Redis Completion Loses Claim Ownership

## What to build

Ensure a worker that writes final storage outputs but then fails to complete the Redis Transform Job because it no longer owns the active claim cleans up those outputs. If a claim expires during a long transform, the stale worker should not leave uploaded primary files or output variants that are not attached to the authoritative completed Transform Job.

This slice should preserve claim fencing while extending rollback semantics to completion-rejected writes.

## Acceptance criteria

- [x] If Redis `complete` rejects or no-ops because the worker no longer owns the active claim, the worker rolls back the primary uploaded file.
- [x] If output variants were written before completion rejection, those output files are also rolled back.
- [x] Rollback is best-effort and does not overwrite the current Transform Job state.
- [x] No completed lifecycle listener runs when completion is rejected.
- [x] `onUploadComplete` does not run when completion is rejected.
- [x] The current/recovered worker can still complete the Transform Job successfully.
- [x] Tests simulate a claim expiring after storage writes but before `complete`.
- [x] Tests assert stale-worker primary and output keys are deleted while the authoritative worker result remains intact.

## Blocked by

- None - can start immediately.
