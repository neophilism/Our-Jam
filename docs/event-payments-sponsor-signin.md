# Artist event plans, silent sponsor videos and account sign-in

Development branch: `feature/artist-event-payments-sponsor-video`. These changes must not merge to main or deploy to the current rehearsal until the complete feature set is accepted. The current rehearsal database must not receive these migrations during development.

## Requested behavior

Fans participate without paying. Artists buy per-event access based on the sum of verified uploaded track durations, rounded up to the next whole minute. Administrators set currency and three increasing per-minute prices: platform sponsors (default), ad-free, and the highest plan for artists' own sponsors. Prices start unconfigured, with no invented commercial rates. Per-event upgrades credit prior verified payments. Recurring subscriptions are a subsequent billing mode; these event purchases are never described as subscriptions.

Platform administrators manage a library of silent MP4 videos and choose the ordered playlist, total sponsor seconds and slot seconds. Fifteen total seconds with five-second slots permits three ads. Videos play over the opening music, never as banners or website images. Uploaded audio is stripped from video. The countdown always runs during a sponsor opening, even if a video cannot load. It pauses with the song; a reconnect resumes the existing timeline. Crowd submissions and votes are denied server-side until the sponsor opening ends. An ad-free plan starts participation immediately. Each round freezes its sponsor plan so configuration changes cannot replace it mid-round.

Sponsor uploads and signed preview/public delivery explicitly use `video/mp4`; music retains `audio/mpeg`. Regression coverage exercises real MP4 preparation and the upload/publish/preview routes, S3 upload metadata and signed response MIME overrides. The loopback-only rehearsal store remains MP3-only and rejects video requests rather than returning a mislabeled file.

Performers and fans receive signup/sign-in with email/password and configured Google/GitHub/Vercel social providers, email verification codes, password reset and sign-out. Managed Neon Auth owns passwords and OAuth secrets. The application verifies branch-bound EdDSA JWTs and exchanges them for existing scoped HttpOnly sessions, expiring no later than the identity token. Choosing performer creates that artist's account; it never grants platform administration. First sign-in can preserve an existing guest profile. Returning identities restore their existing profile; distinct guest accounts and voting budgets are not silently merged. Existing bootstrap/recovery access remains compatible.

## Configuration for a later isolated acceptance deployment

- `COMMERCE_ENABLED=1`; `PLATFORM_ADMIN_TOKEN` (a new secret, separate from performer keys).
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for Stripe test mode initially. Webhook path: `/api/webhooks/stripe`. Supported events: checkout completion, async success, expiration, refunds and disputes. A success redirect never grants access.
- `COMMERCE_LIVE_PAYMENTS_ACK=our-jam-live-charges-approved` is required with live Stripe keys. Do not enable live charges merely to test the UI.
- `IDENTITY_ENABLED=1`; isolated-branch `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL`; `AUTH_SOCIAL_PROVIDERS=google,github` for providers actually enabled on that branch.
- Enable email/password, verification codes and password reset in the isolated Neon Auth branch. For public production use configure custom SMTP in Neon Auth; application release-email credentials remain separate.
- Register the exact isolated app origin as a trusted Auth domain. Google requires its OAuth client ID and client secret in Neon Auth, with callback `{NEON_AUTH_BASE_URL}/callback/google`. GitHub requires its own OAuth client ID/secret and matching callback. Configure only providers actually enabled; no placeholder sign-in options.
- Existing project-specific private S3-compatible storage serves prepared video through authenticated preview and published-video redirects. Sponsor credentials never enter browser code.

Apply migrations 009 and 010 only to an isolated development database and reapply runtime grants there. Existing routes keep commercial controls off unless explicitly enabled. Never run development migrations on the current rehearsal while the owner is testing it.

## Required acceptance before merge

- Verify quotes, whole-minute rounding, setlist changes, paid plan upgrades, duplicate commands/webhooks, exact amounts/currency, failed and expired sessions, refund/dispute revocation and artist isolation.
- Verify platform versus artist video ownership, publish/unpublish, actual stripping of audio, silent playback, playlist order, countdown, pause/resume, reconnect, video failure and no submissions/votes before participation starts.
- Verify signup, Google and email sign-in, email verification, password reset, logout, session expiry/renewal and profile preservation using real isolated provider accounts. Fixtures do not establish real provider acceptance.
- Exercise the web flow on real iPhone/Android browsers, especially Safari cookie restrictions. Native account-login integration and actual native provider handoff require their own acceptance and must not be implied by web tests.
- Keep all feature PRs on the development branch until these gates are complete. No current rehearsal settings or production resources have been changed by source implementation.

Official integration references: https://docs.stripe.com/checkout/fulfillment.md?payment-ui=stripe-hosted ; https://docs.stripe.com/events/manage-webhook-endpoints ; https://neon.com/docs/auth/quick-start/react ; https://neon.com/docs/auth/guides/plugins/jwt .
