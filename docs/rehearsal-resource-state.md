# Resource reconciliation for zero-budget rehearsal

This note supersedes stale external-state assertions in the older deployment procedure. It does not claim a hosted service or production migration exists.

The owner confirmed Phillip's workspace (`tea-db23jkks728c73av263g`), reports GitHub secrets `MUREKA_API_KEY` and `STABLE_AUDIO_KEY`, and set an immediate $0 spending limit. Prior scoped authorization for the production migration set and making a Render slot available exists; do not ask for the same broad approvals as though absent. No paid upgrade, unspecified service deletion or music-provider call follows from them.

Render discovery showed fewer services than its earlier Hobby cap. The free dedicated Our Jam rehearsal create was nevertheless blocked by the tool safety check. No Our Jam hosted URL or successful deployment was produced; a subsequent service read still found none. Do not reroute that denied operation through another tool, provider or split request. The separately requested single-Mac runtime does not create cloud resources or use production credentials.

Neon project `crimson-hat-87508124` was verified on its free plan. The isolated branch `br-blue-unit-b5rk1hit` contains migrations 001-008 and a restricted `our_jam_app` role without role/database creation or RLS bypass. Production branch `br-aged-sea-b55fzq0v` was empty at inspection and has not been mutated by this work.

Object Storage is enabled. Private bucket `our-jam-media` exists on the isolated branch, created October 11 at 23:40:54 UTC. Its endpoint is `https://br-blue-unit-b5rk1hit.storage.c-7.us-east-2.aws.neon.tech`, region `us-east-2`, with path-style S3. Store audio objects there, not in large relational rows. Real hosted ingestion/delivery and credential wiring remain unverified. The temporary storage-only credential for the denied service was revoked. Local rehearsal uses private files with a 1 GiB cap instead.

Neon's official GA announcement documents S3-compatible Object Storage: https://neon.com/blog/neon-backend-is-ga. Product availability is not application integration evidence or permission to incur charges.

The owner does not yet have Apple Developer membership. The accepted universal Simulator `.app` is locally ad-hoc signed for Simulator Keychain access and passed native-to-stage testing. It is not a TestFlight `.ipa` or Apple-signed distribution build. Simulator entitlements do not substitute for a real Apple team and provisioning profile. Standard public-repository runners are used, not paid larger runners. Apple guidance: https://developer.apple.com/help/account/membership/programs-overview.

Real music requests remain prevented at $0. Tags and votes work independently. Closing an eligible round records `approved_budget_zero` before a chargeable attempt; actual provider insufficient-credit rejection is separately fixture-tested. No automatic Thursday funding increase is scheduled.
