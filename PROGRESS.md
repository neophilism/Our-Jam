# Our Jam implementation progress

The approved scope remains 54 work packages in registry/roadmap.json. Implementation PR counts are not completion percentages. Earlier detailed evidence is preserved verbatim in [the historical progress record](docs/history/progress-before-dual-provider.md).

## October 11 real-rehearsal delivery

The user requested the actual native app, actual public-screen window, real album files and real audience contributions, with Mureka and Stable Audio selectable and a current spending limit of **$0**. No demonstration data belongs in user startup. Thursday is not automatic permission to spend. The user confirmed Phillip's workspace and reports GitHub secrets MUREKA_API_KEY and STABLE_AUDIO_KEY. GitHub secrets are not automatically runtime environment variables.

| PR | State and evidence | Delivered increment |
| --- | --- | --- |
| [23](https://github.com/neophilism/Our-Jam/pull/23) | Merged as fde8f593dbb669fc545155f423bac6dd3426857a; exact head 6c6b419808e450abe691a8cb2d469722bbc9cd8e passed run 38184252855 | Mureka / Stable Audio selector, frozen per-round provider, asynchronous Mureka task persistence, exact STABLE_AUDIO_KEY support, real $0 budget rejection before calls/reservations, explicit failure explanations and independent audience-to-stage browser checks |
| [24](https://github.com/neophilism/Our-Jam/pull/24) | Merged as 273d47b4220b0a127ae4c4228a69ed3a836dec65; exact head 212d8f8a9adf96cd4852a335bb09a727cbb84547 passed run 38184500511 | Real MP3/WAV album ingestion, full decoding, measured duration, private content-addressed storage, stable authenticated playback, source immutability and ownership/replay tests |
| [25](https://github.com/neophilism/Our-Jam/pull/25) | Implementation and acceptance in progress; inspect exact-head CI and the evidence addendum before claiming release | Genuine dependency-free SwiftUI audience client, simulator build/test pipeline, persistent single-Mac API/database/audio runtime and actual multi-window local rehearsal |

PR23 and PR24 passed application/database/media checks, browser checks, dependency audit and Docker builds before merging. Native Release simulator compilation has succeeded. A successful compile is not yet a native interaction test, delivered artifact or TestFlight build; the simulator test and local end-to-end startup/restart checks remain required for PR25 acceptance.

## Running surfaces and data boundaries

The performer console remains /performer and /performer/:slug. Audience participation is /event/:slug, and the exact external-monitor surface is /screen/:slug. The iOS client uses the same mobile guest API and event state, not a phone-shaped web page. Its current focused rehearsal scope does not complete Android, native background/push, detailed native feedback/recognition, or full V1 acceptance.

The local entry point is scripts/local-rehearsal.ts, launched by Start Our Jam.command. It binds only 127.0.0.1, creates no events/votes/songs, uses disk-persistent PGlite and private files in ~/.our-jam-local, and runs the actual $0 generation worker. No provider or cloud credentials are used. It is a separately requested single-Mac deployment, not a retry of a denied Render operation. See docs/local-real-rehearsal.md and apps/ios/README.md.

Uploads create a validated 192 kbps MP3 playback derivative from a 15-second to ten-minute MP3/WAV, with a 128 MiB input limit. The original master is not retained; the artist must keep it. The local private audio store has a 1 GiB cap. No storage encryption, physical audio routing or venue load qualification is implied.

## External state verified in this session

- Neon project crimson-hat-87508124 is on the free plan. Its isolated rehearsal branch br-blue-unit-b5rk1hit has migrations 001-008, zero events at inspection and a verified restricted our_jam_app runtime role.
- Neon Object Storage is enabled. A private **our-jam-media** bucket was created on that isolated branch on October 11 at 23:40:54 UTC. Endpoint: https://br-blue-unit-b5rk1hit.storage.c-7.us-east-2.aws.neon.tech. Real S3 upload/download and runtime credential wiring remain unverified.
- The user confirmed workspace tea-db23jkks728c73av263g. Render discovery now showed fewer services than the previous 25-service limit, but the dedicated free Our Jam service creation was blocked by this session's safety review. **No service was created. Do not retry that denied operation through another route.** The historical capacity error is not the current definitive blocker.
- Earlier user authorization for the scoped production migration set and freeing a Render slot must not be requested again as though absent. No production SQL mutation or unrelated service deletion occurred in this session.
- No real music-provider request, email, paid resource or Apple membership purchase occurred. TestFlight remains unavailable until membership/signing/submission access is established.
- Engine Room's older registry/prs.json remains an as-of snapshot; registry/roadmap.json and this progress record contain the current implementation evidence. Actual Engine Room ingestion has not been verified.

## Remaining acceptance

Complete and verify the native simulator artifact and local empty-start/upload/participation/display/$0/restart loop; connect and verify a hosted runtime when the denied deployment operation is legitimately resolved; test real private Neon storage; configure provider secrets through an authorized runtime path; perform real Mureka/Stable Audio generation only after an explicit nonzero allowance and provider price/rights checks; verify physical devices, original audio hardware and complete native/store scope. The current architecture is server-authorized, not end-to-end encrypted, and no independent security certification is claimed.
