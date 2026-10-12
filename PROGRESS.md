# Our Jam implementation progress

The approved scope remains 54 work packages in [registry/roadmap.json](registry/roadmap.json), with the original dependency and acceptance detail in [backlog.json](backlog.json). Implementation PRs are not completion percentages. Earlier progress is preserved verbatim in [the historical record](docs/history/progress-before-dual-provider.md).

## Verified real-data rehearsal

The user requested the actual native app, the actual external-monitor browser window, real album uploads and real audience contributions, with Mureka and Stable Audio selectable and an immediate spending limit of **$0**. User startup contains no demonstration events, songs or votes. Thursday is not automatic permission to spend.

| PR | Exact evidence | Delivered increment |
| --- | --- | --- |
| [23](https://github.com/neophilism/Our-Jam/pull/23) | Head 6c6b419808e450abe691a8cb2d469722bbc9cd8e passed 38184252855; merged as fde8f593dbb669fc545155f423bac6dd3426857a | Frozen per-round Mureka / Stable Audio selection, asynchronous Mureka task persistence, STABLE_AUDIO_KEY support, distinct budget/credit/unknown states and no-call $0 processing |
| [24](https://github.com/neophilism/Our-Jam/pull/24) | Head 212d8f8a9adf96cd4852a335bb09a727cbb84547 passed 38184500511; merged as 273d47b4220b0a127ae4c4228a69ed3a836dec65 | Real MP3/WAV ingestion, full decoding, measured duration, private content-addressed storage and authenticated stable playback |
| [25](https://github.com/neophilism/Our-Jam/pull/25) | Head dbc77eab08fe0f6c14772c1e9c8c8f1cd8eafbe1 passed application 38249785125 and native 38249785143; merged as 8497a91218c46a3e3ccabc40b87789877cc1776f | Genuine SwiftUI app, origin-scoped Keychain sessions, real native contribution/voting-to-stage acceptance, persistent empty-start single-Mac runtime and Simulator package |
| [29](https://github.com/neophilism/Our-Jam/pull/29) | Integrated head 5820e815510f69fbac6dbc6e19f44f9b2d71ffce passed 38251754557; merged as 4042930bb580f6d7e35a2fff42c5d57c67ff797e | Exact native connection fields and an opener-isolated window for the existing public-screen renderer |

PR25's genuine Simulator test ran on iPhone SE (3rd generation), iOS 26.2. The native app submitted `Native warm brass`, stored two points, and the real `/screen/native-integration` page displayed that same submission. Both Intel and Apple Silicon Simulator architectures compiled; only the recorded Simulator environment is interaction evidence. This is not physical-device, paid-provider or TestFlight acceptance.

Accepted core artifact: [OurJam-iOS-Simulator](https://github.com/neophilism/Our-Jam/actions/runs/38249785143/artifacts/11747614922). SHA-256: `fbf9d6ef0182a9771ed12550906711d0fd33bbcc865d98c7553c7d07847dd47c`. It includes an actual Simulator `.app`, the exact source and launchers. [Diagnostic evidence](https://github.com/neophilism/Our-Jam/actions/runs/38249785143/artifacts/11747664862) contains native and stage screenshots plus matching JSON. These are isolated CI fixtures, not content seeded into the user's application. The core artifact precedes the subsequent monitor panel and lifecycle/recovery increments.

## Follow-up work still awaiting its final gate at this revision

PR28 adds the production round/lease lifecycle to local startup and graceful event-stream shutdown. Its 59 application/domain/media tests and browser/audit/Docker suite passed at 197826172448b5c6a6093705459a3c7c2ae6f369 (38250888197), then at integrated head bd531ba799f7ce947a928b8580a259463166c030 (38251859578). Its final native gate remains required before merge.

PR30 adds native recovery-key creation/replacement/disabling, explicit restoration and artist following through the existing real APIs. Head c6dafe7b213010dfd4f5cda2c37e011592dee3f3 passed application run 38250474726. Its first native attempt compiled but the XCTest accessibility daemon failed to initialize before any UI test; one rerun was started. Compilation is not proof that the new recovery UI works. Attach the final native result before marking that increment accepted.

## Running surfaces and data boundaries

See [local setup](docs/local-real-rehearsal.md). `Start Our Jam.command` runs the actual API on `127.0.0.1`, with disk-persistent PGlite and private audio under `~/.our-jam-local`. It creates no events or sound elements and uses no provider or cloud credentials. Both local generation budgets are hardcoded to zero. Public rehearsal surfaces are `/performer`, `/event/:slug` and `/screen/:slug`; the native app uses the same event and scoped guest API.

The localhost server is reachable from the same Mac's iOS Simulator, not separate audience phones. A localhost QR does not constitute a hosted event. Files are permission-protected, not application-encrypted. Uploads create a 192 kbps MP3 playback derivative from a 15-second to ten-minute MP3/WAV, capped at 128 MiB. Keep original masters. The private local audio store caps files at 1 GiB.

The Mureka and Stable Audio integrations use the private core prompt plus selected Sound Waves. They do not remix the uploaded waveform. Provider selection is frozen into each round; changing the toggle does not change already open or queued work. A $0 block is genuine local policy enforcement, not a fabricated provider insufficient-credit response.

## External resources and remaining scope

[Resource reconciliation](docs/rehearsal-resource-state.md) supersedes older deployment-status text. The owner confirmed Phillip's workspace and reports GitHub secrets MUREKA_API_KEY and STABLE_AUDIO_KEY. These are not established as hosted environment variables and have not been validated with live music requests.

Neon Object Storage is enabled with the private `our-jam-media` bucket on the isolated Our Jam branch. Real hosted S3 upload/download is unverified. The earlier free Render service creation was blocked by the tool safety check and was not retried through another mechanism. No hosted Our Jam URL or production migration is claimed. The unused temporary storage credential was revoked.

No provider request, email, paid resource or Apple membership purchase occurred. TestFlight awaits membership/signing/submission setup and remaining store acceptance. Android/Expo security resolution, native background/offline/push and full feedback/recognition parity, physical audio, accessibility and venue-load/recovery acceptance remain work. Do not label full V1 complete or describe all remaining work as merely funded tests. The architecture is server-authorized, not an end-to-end-encryption or independent security certification claim.

Engine Room's `registry/prs.json` remains an explicitly historical as-of snapshot. Current implementation evidence is in this record and the canonical roadmap; actual Engine Room ingestion remains unverified.
