# Event release email and foreground notifications

Release email is optional and off by default. An audience member can subscribe after joining an event, using the web guest cookie or native guest bearer contract. It does not subscribe them to artist marketing or establish a recoverable account. The address must be confirmed before future releases qualify. Existing releases stay available through the event page without an email address. The web audience receives a dismissible foreground notice when a new published release appears; it never starts phone audio automatically.

## Data and consent boundaries

Migration `004_release_email.sql` adds event subscriptions, suppression records, delivery jobs, publication fanout receipts and webhook receipts. Subscriptions are scoped to the authenticated participant and event. Public snapshots and performer delivery statistics contain no email addresses or tokens. Contacts and frozen outgoing message bodies use AES-256-GCM with random nonces and row-purpose authenticated data. Address indexes are keyed HMACs. The application and the configured email vendor necessarily process the recipient address and message in plaintext; this is server-side encryption at rest, not end-to-end encryption.

Confirmation tokens are random 256-bit values, expire in one hour, and are consumed once. Lookup values are hashed. Only the encrypted message payload contains the outgoing token. Confirmation and unsubscribe links use URL fragments, which browsers do not send to the server; the landing page clears the fragment and requires a button press. GET requests and email link previews cannot opt someone in. Email possession confirms only that event preference and does not sign in or merge accounts.

Verification requests are limited to one per hour and three per rolling day for an address across events and sessions, with an additional per-session route limit. A neutral response prevents address enumeration. Bounce, complaint and provider-suppression webhooks suppress future delivery to the keyed address. Unsubscribe from an email stops all subscriptions to that event for the same address; the signed-in preference control stops only that participant's subscription. Tokens for old replaced addresses no longer authorize preference changes. Contacts and message payloads are erased on unsubscribe or suppression. Unconfirmed contacts expire and are purged by the enabled worker after one additional day. Accepted and terminal delivery payloads are erased; IDs, keyed indexes and minimal receipts remain for deduplication/audit. A broader account-deletion/retention policy remains a separate release gate.

## Dispatch and recovery

Fanout reads committed public releases. Only subscriptions verified at or before publication qualify. One unique job per release and keyed address prevents duplicate logical messages across sessions. Publication does not wait for email. Before dispatch, the worker rechecks unsubscribe, expiry and release visibility. Requests already in flight cannot be recalled.

The inline worker uses short serialized database transactions, one-minute attempt leases, a shared one-send-per-second limiter and a required rolling-day send cap. No network call holds a database lock. It freezes the complete provider payload before the first attempt and reuses the same idempotency key after uncertain failures or expired leases. Retries use bounded backoff and stop after six attempts or 23 hours from the first reservation, within Resend's documented 24-hour key window. Exhausted uncertainty becomes `unknown`; there is no blind resend button. A confirmed permanent rejection becomes `failed`. `accepted` means provider acceptance, while a signed delivery webhook separately records delivery to the receiving mail server. These states never promise inbox placement or a precise delivery second. This initial throughput and single dispatch lock need crowd-size validation before a large show.

Svix verifies the exact raw body, signature and timestamp before webhook data is parsed or acted on. Receipt IDs deduplicate replayed valid events. Only the exact email webhook endpoint is exempt from browser Origin checks; audience and artist mutations still require the configured Origin. Svix 2.8's `verify` returns void, so JSON parsing occurs only after successful verification. Invalid signatures, timestamp failures and forged callbacks cannot change preferences.

## Enablement checklist

1. Apply migration 004 on the isolated development branch, rehearse it, then use the separately approved production migration procedure. `/api/ready` now requires 001–004. Older application versions tolerate the additive tables for rollback.
2. Use an Our Jam-specific Resend key and a verified sending address/domain. Configure signed webhook delivery to `https://YOUR_ORIGIN/api/webhooks/email` for `email.delivered`, `email.bounced`, `email.complained` and `email.suppressed`.
3. Set `EMAIL_FROM`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, a newly generated 32-byte hex `EMAIL_DATA_KEY`, and an approved `EMAIL_MAX_SENDS_PER_DAY`. Keep the data key in the project's secret manager and recovery backup. Key rotation requires re-encrypting retained contacts/jobs and updating keyed indexes before switching; replacing the key without a migration makes them unreadable. No key value belongs in Git, logs or a ticket.
4. Only after sender ownership, cost and live delivery rehearsal are authorized, set `EMAIL_DELIVERY_ACK=approved-event-email` and `EMAIL_ENABLED=1`. A missing or invalid required value fails startup. Do not enable real sends merely to make a UI button appear.
5. Verify confirmation, actual release delivery, unsubscribe, bounce/complaint handling, expired links and recovery with controlled addresses. Inbox/provider integration and production throughput are not established by fixture tests. Disable click/open tracking at the sender unless separately reviewed and consented.

Set `EMAIL_ENABLED=0` to stop dispatch and new collection. Existing unsubscribe endpoints continue to work without the encryption key. With the worker disabled, automatic expiry cleanup also stops and must be handled by the documented operations process. No real email, paid service, webhook registration or credential provisioning was performed as part of this implementation. Native push, web push, bounce appeal, marketing, provider reconciliation tooling and multi-artist sender administration remain open.

## Contracts and evidence

- `GET/POST/DELETE /api/events/:id/subscription`: capability/preferences, explicit opt-in and owner removal.
- `POST /api/email/verify`, `POST /api/email/unsubscribe`: token in JSON body, same-origin browser request, no guest cookie required.
- `POST /api/webhooks/email`: authenticated raw-body Resend/Svix events.
- `GET /api/operator/events/:id/email`: owner-only aggregate subscription and job states.

Migration 004 was applied successfully to isolated Neon branch `br-blue-unit-b5rk1hit` on October 11, 2026. No production schema changed.

API tests cover encrypted persistence, row binding, token expiry, origin rejection, duplicate fanout, unsubscribe, signature checks, replay, suppression, immutable retry payloads, retry-window expiry and capacity reservation. Browser fixtures confirm opt-in/unsubscribe from a separate cookie jar on desktop and mobile Chromium. The test-only mail capture endpoints exist in `scripts/test-server.ts`, are bound to loopback and are excluded from the production build. They send nothing externally.

Primary contracts checked October 11, 2026: [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email), [Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys), [Webhook Verification](https://resend.com/docs/webhooks/verify-webhooks-requests), [Webhook Event Visibility](https://resend.com/changelog/webhook-event-visibility). Installed Svix source and executable signature tests resolve SDK return-type differences from older documentation examples.
