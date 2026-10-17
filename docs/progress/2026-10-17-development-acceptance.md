# Isolated development acceptance — October 17, 2026

The commerce/sponsor/sign-in candidate is live at https://our-jam.onrender.com, on `feature/artist-event-payments-sponsor-video`. Main and `our-jam-rehearsal` were not changed. These are evidence of specific tests, not full release or independent security certification.

## API deployment

Render service `srv-db6n4uid0e5s73aus43g`, workspace `tea-db23jkks728c73av263g`, free Docker plan, automatic deployment off. Deployment `dep-db9erjom7kps73d4bdng` was triggered through the API and became live at 2026-10-17 03:40:24 UTC on exact commit `eb7cd3f79ed5c1817c0dc710c9b22a8a26ef5f16`. Render read-back still reported `live` on October 17.

Application/browser/audit/build/Docker and deployment run: https://github.com/neophilism/Our-Jam/actions/runs/38998663427 . Exact-commit native Simulator run: https://github.com/neophilism/Our-Jam/actions/runs/38998663442 . All four native tests passed, including two distinct single-tap account returns.

The deployment verified the public commit, `/api/health`, database readiness, configured performer access and `media: verified`. The real private storage startup probe exercised PUT/HEAD/SDK GET, byte-equal signed HTTPS GET, unsigned denial and DELETE. Unauthenticated private route denial and invalid-Origin rejection passed. Generation and release-email sending remain disabled.

## Positive hosted authorization and setup

At approximately 11:57–12:00 UTC, `scripts/check-development-sessions.mjs` ran against the actual hosted service with its private prepared credentials. Both real bootstrap logins returned secure, HttpOnly, SameSite=Strict cookies. Fresh requests restored each session. One administrator session accessed both voting and commerce administration. An administrator cookie could not read performer events, and a performer cookie could not read either administration endpoint. Authenticated invalid-Origin logout requests were denied. Valid logout succeeded and replaying each former cookie was denied.

The protected commerce setup response confirmed private storage, enabled identity, the exact trusted development origin, Google callback and sandbox webhook endpoint. Its missing-credential diagnostics matched configuration: **STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are absent**. No Stripe transaction was attempted.

Administrator setup: https://our-jam.onrender.com/admin/commerce . Voting: https://our-jam.onrender.com/admin . Performer: https://our-jam.onrender.com/performer . Retrieve this isolated development service's `PLATFORM_ADMIN_TOKEN` or `OPERATOR_TOKEN` privately from Render Environment; never put either in chat, issue bodies or repository files.

## Real hosted sponsor preparation and private delivery

A temporary two-second blue MP4 with an audible sine-wave track was generated locally and uploaded through the actual protected hosted admin upload endpoint. The server measured its length and stored it unpublished. Public delivery was denied before publication; private preview required administrator authentication. Its signed HTTPS download returned `video/mp4` from the isolated acceptance bucket. The downloaded derivative had exactly one video stream, no audio stream, and fully decoded with FFmpeg. The unsigned URL was denied. Publishing enabled the public redirect; unpublishing removed it.

The diagnostic video was not attached to an event or the platform rotation. It was unpublished, its exact newly created database row was removed, and its private object was deleted; authenticated HEAD returned 404. Existing settings, prices, videos, songs and events were not modified. This test does not establish crowd countdown/pause/reconnect on a hosted song or physical-device video playback.

## Managed Auth integration

A uniquely named disposable account under `example.test` successfully signed up and signed in against the actual managed Neon Auth service. Session restoration, real Ed25519 JWT issuance, unverified-account rejection by the hosted app, managed sign-out and replay denial passed. No delivered email or Google consent is claimed by that test. The diagnostic account was then marked verified explicitly as a controlled fixture to exercise real signed-JWT application exchange; this administrative fixture step is not email verification. Fresh real signed JWTs then successfully exchanged for both performer and audience sessions; fresh reads restored the expected artist/profile, neither gained administrator access, and identity logout revoked both application cookies. Managed logout also invalidated the auth session. The uniquely created application identity, participant, artist and residual diagnostic sessions were removed, followed by the managed test user. No owner account or existing event was changed.

## Repeatable hosted browser acceptance

The `Hosted development acceptance` workflow runs only on pushes to the approved development branch when its scripts/workflow change. It reads only this service's Render configuration, validates the isolated service/database/Auth/media settings, and runs the positive API checks followed by actual desktop/mobile browser login, setup, shared admin navigation/reload, logout, performer restoration, and Google/signup entry checks. It does not deploy, change pricing or create an event. No traces, HAR, cookies, storage-state, credential files or response bodies are uploaded. Success screenshots and a bounded report identify the hosted commit separately from the test-source commit.

This workflow is newly introduced; do not mark hosted browser acceptance passed until its actual run succeeds. Local Chromium installation returned truncated archives, so local browser execution was unavailable; the successful API/media checks above did not depend on it.

## Remaining owner/provider/hardware acceptance

- Stripe sandbox hosted Checkout, signed webhook fulfillment/replay/refund: both sandbox secrets are required. Follow https://dashboard.stripe.com/apikeys and https://dashboard.stripe.com/webhooks ; exact endpoint/events and key names are in [credential setup](../development-credential-setup.md) and the protected setup panel. No publishable key is needed for hosted Checkout.
- Real Google consent and owner account login; actual email delivery, code verification and password-reset delivery. Shared development Google/SMTP are provisioned; production branding/custom credentials are separate.
- Hosted song playback, sponsor countdown/pause/reconnect and performer-owned sponsor plan through a verified purchase; physical iPhone/Android/venue acceptance.
- Commercial price choices and actual owner sponsor files. Current zero test rates are not a priced live offering. No subscription billing has been claimed; this slice implements pay by event.

Keep aggregate PR51 draft and all work off main until complete acceptance. Independent human review remains follow-up, not a prerequisite for these authorized tests.

## Source validation

Local `npm run check` passed: canonical plan validation, TypeScript and all 113 tests (zero failures/skips). New hosted scripts pass Node syntax checks. Required PR CI and the hosted browser run remain separate checks and must be recorded from actual results. Engine Room synchronization is pending; repository evidence is current and does not claim a live Engine Room update.

PR79 head `54b8c08` passed full GitHub Actions run 39031387933 and CircleCI application/security jobs. CircleCI native job 165 failed before compilation: Homebrew crashed while pouring `ca-certificates` (`undefined method '[]' for nil`, `Utils::Bottles.load_tab`). The follow-up replaces that mutable Homebrew installation with a pinned upstream Node 24.21.0 ARM64 distribution, verifies the exact archive against the vendor SHA-256 manifest and persists only a job-private binary path. No native assertion or gate is removed. The new exact-head checks must pass before development merge.
