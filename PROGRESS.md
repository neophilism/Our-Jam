# Our Jam implementation progress

The approved scope remains 54 work packages in [registry/roadmap.json](registry/roadmap.json), with original dependency/acceptance detail in [backlog.json](backlog.json). Implementation PRs are not completion percentages. Earlier progress is preserved verbatim in [the historical record](docs/history/progress-before-dual-provider.md).

## Verified real-data rehearsal

User startup contains no demonstration events, songs or votes. The owner supplies real audio and Sound Waves; the native app, performer console and actual public-screen route share the same authoritative event. The immediate spending limit is **$0**, not an automatic Thursday allowance.

| PR | Verified head and runs | Delivered increment |
| --- | --- | --- |
| 23 | 6c6b419808e450abe691a8cb2d469722bbc9cd8e; 38184252855 | Frozen Mureka / Stable Audio selection, task persistence, exact STABLE_AUDIO_KEY support and no-call $0 block |
| 24 | 212d8f8a9adf96cd4852a335bb09a727cbb84547; 38184500511 | Actual MP3/WAV ingestion, full decoding, measured duration, private storage and authenticated playback |
| 25 | dbc77eab08fe0f6c14772c1e9c8c8f1cd8eafbe1; application 38249785125 and native 38249785143 | Genuine universal SwiftUI Simulator app, Keychain identity, actual native contribution/votes appearing on the public screen, persistent empty-start local deployment |
| 29 | 5820e815510f69fbac6dbc6e19f44f9b2d71ffce; 38251754557 | Native connection fields and an opener-isolated window for the existing monitor renderer |
| 28 | bd531ba799f7ce947a928b8580a259463166c030; application 38251859578 and native 38251859568 | Automatic local deadlines/controller recovery, startup reconciliation and graceful stream shutdown without aborting ordinary requests |
| 31 | bce22e76c2ee2981bc2fb05cac80f10064623899; application 38257068795 | Read-only prerequisite checker and exact source/platform dependency repair before local startup |

These increments are merged. PR25 merged as 8497a91218c46a3e3ccabc40b87789877cc1776f; PR29 as 4042930bb580f6d7e35a2fff42c5d57c67ff797e; PR28 as 14648011cb7d9bea25801b8922ddc221b500b911; PR31 as e42777299f7d07318f98e02043aae7c8359d3121.

The accepted native tests ran on iPhone SE (3rd generation), iOS 26.2. The actual app submitted `Native warm brass` and persisted two points; Playwright then found the same submission on `/screen/native-integration`. Both Intel and Apple Silicon Simulator architectures compiled with ad-hoc Simulator Keychain signing. Only the recorded Simulator is interaction evidence, not a physical-device or TestFlight test.

Accepted native/local lifecycle package: [OurJam-iOS-Simulator](https://github.com/neophilism/Our-Jam/actions/runs/38251859568/artifacts/11749018755). SHA-256: `af500f113acf0aeb1a4cf68688f193f296141c86e1514a7f3ba617581c586d70`. Its COMMIT.txt records the actual checkout used by CI; the PR head above identifies the corresponding reviewed change. [Native and stage evidence](https://github.com/neophilism/Our-Jam/actions/runs/38251859568/artifacts/11749378658) includes screenshots and matching JSON. These are isolated CI fixtures, never content seeded into user startup. That immutable source package predates later launcher and native recovery changes; use the current independently tested source bundle when those changes are required.

## Native increments still gated at this revision

PR30 adds recovery-key create/replace/disable, explicit profile restoration and following. Head 2230412b98c36854b262faaa2896ea5e06304242 passed application 38255189352 and native compilation/signature checks. Native run 38255189340 attempt 1 failed when the XCTest runner was killed before connecting and before test methods ran. A single failed-job retry was requested; do not treat compilation or that infrastructure failure as recovery interaction acceptance.

PR32 builds on PR30, releasing the Sound Wave keyboard after submission and pausing inactive or withdrawn private playback. Its new real Simulator keyboard assertion preserves native-to-stage and recovery checks. It remains dependent on PR30 and its own final gates; no merge or release is predeclared here.

The accepted core package remains valid while these independent increments are checked. Neither pending branch may be distributed as fully accepted merely because a compiled-only artifact exists.

## Local workflow and security boundaries

The actual local API binds `127.0.0.1`, with persistent PGlite and private audio under `~/.our-jam-local`. It uses no provider/cloud credentials. The ordinary performer, audience and monitor paths remain `/performer`, `/event/:slug` and `/screen/:slug`. The Simulator uses the same native guest API. Separate physical phones cannot reach this Mac's loopback address; localhost QR codes are not hosted crowd onboarding.

Uploads create 192 kbps MP3 playback derivatives with a 128 MiB input cap and catalog duration limits; keep the original masters. The private local store has a 1 GiB cap. OS file permissions are not application encryption. Physical input/output routing, long recording and venue capacity still require actual hardware acceptance.

Both generation adapters use private core prompts plus selected Sound Waves, not waveform remixing. Provider choice is frozen per round. Zero-budget rejection occurs before attempts, reservations, media writes or music requests. Upstream insufficient-credit responses are separate fixture-tested states, not fabricated in user events.

## External resources and full scope

[Resource reconciliation](docs/rehearsal-resource-state.md) supersedes stale external assertions in older deployment instructions. The owner confirmed Phillip's workspace and reports GitHub secrets MUREKA_API_KEY and STABLE_AUDIO_KEY. They have not been read or validated with live music calls and are not established as Render runtime variables.

Neon Object Storage and the private isolated `our-jam-media` bucket exist. Real hosted media delivery is unverified. The free Render create was denied by the tool safety check and was not retried through another route. A fresh service read still found no Our Jam service. No hosted URL or production migration is claimed. The unused temporary storage credential was revoked.

No paid provider request, email, paid resource or Apple membership purchase occurred. TestFlight, funded provider billing/quality/latency, hosting/media integration and physical testing remain separate. Android/Expo security resolution, native offline/background/push, detailed native feedback/recognition and remaining full-V1 features are still development work, not all reducible to funding. The architecture is not independently security-certified.

Engine Room's registry/prs.json remains a historical as-of snapshot. Current evidence is here and in the canonical roadmap; actual Engine Room ingestion has not been verified. CI now preserves a checked exact source archive after all application gates pass; that archive is not a native binary and does not relax the native workflow.
