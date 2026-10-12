# Explicit reconciliation of a saved provider task

This fills the UNKNOWN request-lookup gap in OJ-014/OJ-015. It does not retry a generation POST, infer a missing task ID, change the frozen prompt/provider, refund a reservation, or authorize spending.

The owning performer can choose **Check existing task** in Music generation after explicitly confirming. The new authenticated `POST /api/operator/jobs/:id/reconcile` accepts only a command UUID and expected event revision. Exact-Origin middleware, owning-artist lookup, event/job locks, immutable receipts, command replay and an audit entry fence the request. It queues an inspection of the existing task; the HTTP request itself never calls a provider. Receipts and reserved amounts appear only in the authenticated operator projection, not the public screen.

Only UNKNOWN Mureka jobs with a saved task ID, existing paid attempt/reservation, unchanged model, configured durable storage and an explicit resume-capable adapter qualify. Stable Audio does not expose this capability, so it cannot silently ignore a resume hint and create a second task. The Mureka resume capability is GET-only against the documented instrumental query endpoint, then the already-approved audio download hosts. Returned task IDs must match. Missing receipts or an ambiguous initial POST remain manual provider-account reconciliation cases; there is intentionally no blind retry button.

Both requesting and dispatching reconciliation honor the current hard $0 gate. Lowering the allowance after a request was queued blocks its execution without deleting the original receipt or reserved cost. Positive configuration still goes through the existing rights/storage/price guards. No live provider account was contacted to implement or test this feature.

The worker retains the original job, paid-attempt ID, attempt count and reservation. A separate exact database lease timestamp fences each execution's callback, completion and error. A late worker cannot overwrite a newer resumed execution. New generated object keys include the content SHA-256, so a late download cannot overwrite different published bytes under the same attempt path. Existing asset keys remain readable. Failed/stale uploads may leave private orphan objects; production retention/cleanup remains an explicit operational task, not an invented deletion guarantee.

## Verification and release limits

Seven added API/worker/provider tests cover GET-only resumption, concurrent replay/workers, one reservation and release, zero-budget checks before request and after queuing, missing/unsupported receipts, stale-worker races, mismatched task IDs, authentication, Origin, revision fencing, and receipt privacy. Browser tests use an explicitly isolated receipt fixture to verify the disabled $0 control and confirmed request contract on desktop/mobile. They do not claim live provider delivery; SQL-backed API/worker tests cover the actual backend. Full exact-head type, test, browser, dependency, build and Docker gates remain mandatory.

TypeScript syntax/transpilation checks passed locally. Complete CI results must be recorded after execution. The new feature is not a security-conformance certificate. The pinned E2EESA secure-development requirements were read; independent exact-source review and all outstanding product assurance gates remain pending. No new dependency, migration, credential, provider charge or cloud service is introduced.

Rollback: stop workers first. The earlier worker does not pick up `unknown/reconciliation_requested`, so these receipts remain retained rather than being resubmitted. Restore the prior app/worker together, retain all rows/assets/reservations, and arrange explicit handling of pending inspections. Do not rewrite unknown jobs as queued.

Official task-query contract checked October 12, 2026:
https://platform.mureka.ai/docs/api/operations/get-v1-instrumental-query-%7Btask_id%7D.html
