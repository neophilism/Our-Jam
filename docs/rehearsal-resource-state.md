# Resource reconciliation for zero-budget rehearsal

This note supersedes stale external-state assertions in the older deployment procedure. It does not claim a hosted service or production migration exists.

The owner confirmed Phillip's workspace (`tea-db23jkks728c73av263g`), reports GitHub secrets `MUREKA_API_KEY` and `STABLE_AUDIO_KEY`, and set an immediate $0 spending limit. Prior scoped authorization for the production migration set and making a Render slot available exists; do not ask for those same broad approvals as though absent. No paid upgrade, unspecified service deletion or music-provider call follows from those approvals.

Render discovery showed fewer services than its earlier Hobby cap. The free dedicated Our Jam rehearsal create was nevertheless blocked by the tool safety check. No Our Jam hosted URL or successful deployment was produced. Do not reroute that denied operation through another tool, provider or split request. The user's separately requested single-Mac runtime does not create a cloud resource or use production credentials.

Neon project `crimson-hat-87508124` was verified on its free plan. The isolated branch `br-blue-unit-b5rk1hit` contains migrations 001-008 and a restricted `our_jam_app` role without role/database creation or RLS bypass. The production branch `br-aged-sea-b55fzq0v` was empty at inspection and has not been mutated by this work.

Object Storage is enabled, and private bucket `our-jam-media` exists on the isolated branch, created October 11 at 23:40:54 UTC. The endpoint is `https://br-blue-unit-b5rk1hit.storage.c-7.us-east-2.aws.neon.tech`, region `us-east-2`, with path-style S3. Store media objects there, not as large relational-row blobs. No public bucket policy or unrelated credentials were created. Actual hosted S3 ingestion/delivery and credential wiring remain unverified. The temporary storage-only credential created for the denied service was revoked. The local rehearsal instead uses private files with a 1 GiB cap.

Neon's official September 17, 2026 GA announcement documents S3-compatible Object Storage and a 5 GB per-project Free Plan allowance: https://neon.com/blog/neon-backend-is-ga. This product allowance is not evidence that this application has performed a live object-delivery test or permission to incur charges.

The owner has no Apple Developer membership yet. PR25's actual universal Simulator `.app` is locally ad-hoc signed for Simulator Keychain access and passed native-to-stage acceptance. It is not a TestFlight `.ipa` or Apple-signed distribution build. Simulator-only entitlements do not substitute for a real Apple team/provisioning profile. Standard public-repository runners are used, not paid larger runners. Apple membership guidance: https://developer.apple.com/help/account/membership/programs-overview.

Real music requests remain prevented under $0. Tags and votes remain functional independently. Closing an eligible round records `approved_budget_zero` before a chargeable attempt; an upstream insufficient-credit response is separately tested with fixtures, never fabricated in the user's event. There is no automatic Thursday funding increase.
