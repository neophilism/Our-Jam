# Our Jam source-grounded data-flow and threat inventory (draft)

Status: **partial discovery, not reviewed or complete**. Prepared October 16, 2026 against the current application architecture. This is working evidence for the pinned End-To-End-Everywhere standard at `8441335f359c6e446f9bfe8b959f9606ce341409`; it is **not** E2EE certification, an independent review, or a substitute for the full component-inventory schema/source-and-artifact digests. The canonical status remains `security/e2eesa-status.json` with all stage-complete flags false.

## Components, source and trust authority

| Component | Source / runtime | Trust responsibility |
| --- | --- | --- |
| Performer browser | `apps/web/src/main.tsx`, `ShowPlayer.tsx`, `AlbumUpload.tsx` | Holds an authenticated operator session in HttpOnly cookies, displays private event setup, controls playback |
| Crowd web / native | `apps/web/src/main.tsx`, `apps/ios/OurJam/API.swift`, `SessionModel.swift` | Pseudonymous guest identity, participation and revision-fenced votes; native recoverable secrets stay in device Keychain |
| Public stage | `apps/web/src/Visual.tsx`, `WaveField.tsx` | Renders intentionally public event projection; should receive no private core prompts or identity/recovery secrets |
| Fastify application | `apps/api/src/app-core.ts`, `app.ts`, `service.ts` | Authoritative sessions, event tenancy, authorization, anti-replay and projection boundaries |
| Playback and round worker | `apps/api/src/playback.ts`, `generation.ts` | Sole controller lease, immutable closed-round snapshot, cost/rights gates and recoverable job state |
| Uploaded source media | `apps/api/src/album-uploads.ts`, `album-media.ts` | Authenticated upload and conversion; real masters are not retained after MP3 derivative preparation |
| Private media service | `packages/providers/src/storage.ts`, `apps/api/src/media-readiness.ts` | Branch-scoped Neon S3, private signed URLs and diagnostic PUT/HEAD/GET/delete |
| Music generation adapters | `packages/providers/src/mureka.ts`, `stability.ts` | Intentionally discloses approved prompt text/Sound Waves to the selected third-party service; never uploads source waveform |
| Subscriber/email service | `apps/api/src/email-config.ts` | Server-held AES-GCM contact encryption key; Resend API transport when authorized |
| Local browser data | `apps/web/src/recordings.ts`, `album-cache.ts` | IndexedDB microphone chunks and local source backup; no application E2EE assertion |
| Local rehearsal runtime | `scripts/local-rehearsal.ts` | PGlite and local files restricted to Mac loopback; not the hosted remote-audience path |
| Deployment/secrets | `render.yaml`, `docs/deployment.md` | Render service env, restricted Neon login, scoped S3 credential; provider keys server-side only |

## Material flows and classifications

| Flow | Classification | Authority / boundary | Existing evidence | Additional acceptance |
| --- | --- | --- | --- | --- |
| OJ-F01 Performer login and command session | protected authentication | Browser HTTPS to API; exact Origin, HttpOnly SameSite cookie and owning-artist checks | `apps/api/src/app-core.ts`, `tests/accounts.test.ts`, hosted smoke | Review all moderator/multi-artist roles and real logout/session expiry |
| OJ-F02 Private titles, prompts, queues and revision fences | protected until chosen public parts | Performer API and Neon PostgreSQL; explicit event ownership | `apps/api/src/service.ts`, `tests/show-setup.test.ts` | Source-bound full role matrix and recovery |
| OJ-F03 Artist original upload to MP3 playback derivative | protected | Authenticated binary upload, decode limits, object store, signed redirect | `apps/api/src/album-uploads.ts`, `tests/album-uploads.test.ts` | Test actual owner-file upload/playback from deployed HTTPS |
| OJ-F04 Guest pseudonym, recovery key and room access | protected identity with public opt-in fields | Browser/native Keychain and event-scoped sessions | `tests/accounts.test.ts`, `tests/mobile.test.ts` | Physical iOS/Android and lost-device recovery |
| OJ-F05 Sound Waves and aggregate votes | intentionally public after submission | Guest submissions validated/normalized on server, private individual allocation | `packages/domain/src/index.ts`, `tests/domain.test.ts` and security fuzz | Multi-device venue acceptance and malicious Unicode regression |
| OJ-F06 Event public screen and invalidation | public projection only | Event renderer and bounded SSE/recovery snapshot | `apps/api/src/app-core.ts`, `docs/live-traffic.md` | Real monitor, QR distance and network loss |
| OJ-F07 Core prompt plus ranked public Sound Waves to provider | protected core plus intentionally disclosed audience ideas | Explicit third-party transfer only on spending/rights-authorized generation | `apps/api/src/generation-config.ts`, `packages/providers/src/*` | Real provider rights/pricing/output, document disclosure consent |
| OJ-F08 Generated audio and publication | protected until performer releases | Private S3, validated audio, holds/selected boundary/review | `apps/api/src/generation.ts`, `tests/release-controls.test.ts` | Live end-to-end paid provider delivery |
| OJ-F09 Microphone recordings | protected, local-only | Browser microphone to IndexedDB and explicit user export | `apps/web/src/Recorder.tsx`, `recordings.ts` | Real hardware routing, storage loss and backup |
| OJ-F10 Album local backup/cache | protected local copy | IndexedDB and user-owned backup file | `apps/web/src/album-cache.ts`, `AlbumBackup.tsx` | Disk and eviction recovery on show laptop |
| OJ-F11 Release email subscriptions | protected contact data | AES-GCM server-held key, opt-in, Resend only when enabled | `apps/api/src/email-config.ts`, `tests/email.test.ts` | Real sender/opt-out verification before activation |
| OJ-F12 Render/Neon credentials and infrastructure | protected secrets | Render secret environment, scoped branch SQL role and S3 key | `docs/deployment.md`, startup media probe | Rotation exercise, branch boundary and restoration checkpoint |

## Threats requiring continuing verification

- **Cross-event authorization:** unauthorized artist/guest reads, event ID substitution, fallback session mixups and leaked operator projections. Keep negative tenant/API tests and hosted anonymous denial.
- **Vote integrity and anti-replay:** concurrent five-point allocation updates, stale revisions, round cutoff, late server workers, duplicate commands and shared-address rate budgets. Source of truth remains PostgreSQL, not clients.
- **Input normalization:** Unicode compatibility may convert apparently harmless characters to markup after NFKC; validate **after** normalization and fuzz accepted normalized output.
- **Provider cost duplication:** ambiguous async task receipts, rate limits and retries must never reissue a billed generation POST; continue exact task-ID/lease/reservation checks.
- **Private media exposure:** unsigned S3 reads, URL leakage, overbroad credentials, stale object paths, malicious media hosts and SSRF. Startup diagnostic must not touch real songs and must clean its key.
- **Privacy:** core prompts, unpublished audio, email contacts, recovery secrets and identifying ballots must not appear in public projections, stage screens, logs or artifact ZIPs.
- **Venue reliability:** server auto-suspend, network loss, large crowds, bad clocks, headphone leakage, input clipping and device-storage eviction. Simulated tests do not prove venue hardware.
- **Supply chain:** npm high advisories and native Expo unpatched transitive dependencies remain tracked; do not merge unsafe artifacts or claim Android/physical acceptance before remediation.
- **Cryptographic boundaries:** TLS, server-managed content and server-held AES-GCM email keys do **not** imply content end-to-end encryption; classify intentionally public and authorized server-processing flows explicitly.

## Next technical evidence

1. Complete the upstream `component-inventory.schema.json` and `scoped-assessment-request` profiles with exact assessed-source/build digests, actual component coverage and owner-reviewed applicability.
2. Implement the six required fresh source-bound gates (unit, adversarial, fuzz, secret scanning, dependency scanning and static analysis), with immutable reports/tool/policy digests. Existing CI is useful but not a claim these six gates are complete.
3. Extend tests for multi-artist permissions, private object lifecycle, malicious provider URLs, browser recovery, production-vs-rehearsal secrets and deploy rollback.
4. Perform real phone/venue/owner-file acceptance and funded provider trials when actual resources/rights are available, without inventing observations.
5. Leave independent human review and certification pending until the fully implemented and tested source is handed off; do not block ongoing development solely on that future step.
