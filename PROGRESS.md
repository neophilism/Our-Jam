# Our Jam implementation progress

The approved 54-work-package roadmap is tracked in `registry/roadmap.json`; `backlog.json` preserves the historical dependency specification. Implementation PRs combine coherent vertical slices; merging one does not imply that every touched acceptance criterion is complete.

## Merged and verified

| PR | Delivered | CI evidence |
| --- | --- | --- |
| [#1](https://github.com/neophilism/Our-Jam/pull/1) | Repository foundation, complete development plan, separate DJ V2 and demonstration plans, CI and Engine Room manifest | Plan validation; head `416ec4ecf0f4881f6718efe692d1fbcc9432663e` |
| [#2](https://github.com/neophilism/Our-Jam/pull/2) | Persistent API, five-point ballots, immutable prompt snapshots, queue, releases and feedback | PostgreSQL 18 CI; head `84b8e970a6c91f6c0eb0cb7ac30e7433c7ee51ce` |
| [#3](https://github.com/neophilism/Our-Jam/pull/3) | Responsive audience, public display and performer console | 14 domain/API tests + 4 desktop/mobile Chromium scenarios; run `38096503809` |
| [#4](https://github.com/neophilism/Our-Jam/pull/4) | Fenced playback, pause-aware deadlines, recoverable local recording, corrected 3D shader/canvas | 15 domain/API tests + 6 browser scenarios; run `38097751070` |
| [#5](https://github.com/neophilism/Our-Jam/pull/5) | Guarded generation worker, Stable Audio adapter, private S3 adapter, media validation, Docker and Render Blueprint | 18 domain/API/media tests + 6 browser scenarios + Docker build; run `38098080304` |
| [#6](https://github.com/neophilism/Our-Jam/pull/6) | Contributor credits, artist/event leaderboards, deferred feedback, opt-in room-audio animation | 19 domain/API/media tests + 8 browser scenarios + Docker build; run `38098501258` |

## Latest verified work

PR [#7](https://github.com/neophilism/Our-Jam/pull/7) merged at `51ec3c3e50dfabb903c2781434f3b26434bcc3ed` after CI run `38099031021`: 21 domain/API/media tests, eight browser scenarios and Docker build passed. It adds explicit playback handoff, takeover timing fixes, artist-scoped moderation and final author comment deletion.

PR [#8](https://github.com/neophilism/Our-Jam/pull/8) merged at `800de1cabe256d15a05335b7d09f3735c3877765` after CI run `38099594499`. It adds scoped native guest API credentials, hash-only server persistence, revocation and shared web/mobile client contracts. This is a bounded identity/API increment; Expo distribution and real-device P032 acceptance remain open.

PR [#9](https://github.com/neophilism/Our-Jam/pull/9) merged at `1a8e965dc68b5d3952c72720f6c0b98c901b8a78` after CI run `38111907167`. It verifies ordered migration replay and cross-event source, round, job, release and queue isolation. P003 remains in progress for production migration rehearsal, artist membership authorization, storage isolation and deployment evidence.

P002 remains blocked on real provider entitlement/rights and physical Soundcore Rave routing evidence. The Expo client remains separate: its prior iOS/Android JavaScript bundles and native configuration generation succeeded, but upstream dependency audit findings block merging or distribution without a patched dependency path.

## External resource state

- GitHub initially empty; application and all planning documents now live in this repository.
- Migrations 001–004 rehearsed on isolated Neon branch `br-blue-unit-b5rk1hit`. Production branch `br-aged-sea-b55fzq0v` is untouched. Workspace direct Neon DNS failed, so connector rehearsal and CI PostgreSQL tests are distinct evidence.
- No Our Jam service deployed to Render. The service-creation connector cannot assign project/environment, the dashboard attempt timed out, and no project-specific API credential was available. Target remains `prj-db5btotckfvc739m1ck0`. Docker builds in CI; Blueprint validates against Render's official schema.
- Engine Room discovery manifest is committed. Actual ingestion is unverified.
- No real generation requests, email deliveries, paid resource creation or production database changes occurred.

## Remaining event gates

Deployment inside the supplied Render project; album files, durations and private core prompts; purchase URL; approved provider/storage credentials and budget; verified free-download rights; exact Soundcore Rave model and audio route; physical iPhone/Android, headphones and long recording rehearsal; venue connectivity/load/recovery checks. The current server-authorized architecture is not end-to-end encrypted and no independent security certification is claimed.

Responsive mobile browsers are implemented. Native iOS/Android builds, email/push delivery, recoverable cross-device accounts, offline album playback, multitrack routing and store submissions remain open. Provider/storage adapters use contract fixtures in CI; browser recording uses a real synthetic Web Audio stream, not physical karaoke microphones. This repository is not yet a show-ready deployed service.

## Show preparation increment

Queue reordering now validates a complete permutation of the remaining queue, with revision checks and command replay. Event/display settings and private album fields can be edited from the performer console. A source becomes immutable when its first round opens, and active rounds retain their copied settings. Browser audio preflight checks file metadata and duration without starting playback; it does not prove complete decoding or physical output routing. See `docs/show-setup.md`.

Native client draft [#11](https://github.com/neophilism/Our-Jam/pull/11) is preserved at `e17818c124b977f62beb660df22b1e0a39c0b563`. CI run `38128094671` passed the core job, native type checks, dependency alignment, iOS/Android JavaScript exports and both native prebuilds. The native audit gate failed on upstream advisories; the PR remains unmerged and is not distribution-ready.

## Release notification increment

PR [#12](https://github.com/neophilism/Our-Jam/pull/12) merged at `69163c03ac6c582aaf0a2710de3be4a0d34c8a37` after CI run `38128764587`: 25 domain/API/media tests, ten desktop/mobile browser scenarios, dependency audit and Docker build passed. It delivers the show preparation increment above.

Optional verified event subscriptions, encrypted contact/message storage, durable deduplicated email dispatch, bounded retries and send caps, unsubscribe, signed bounce/complaint suppression and foreground web release notices are implemented in the release-notification increment. Delivery remains disabled; test providers capture fixtures only. Migration 004 was applied successfully as one versioned transaction on isolated Neon branch `br-blue-unit-b5rk1hit`; production remains untouched. See `docs/release-email.md` for exact semantics, enablement and limits. Native/web push and actual sender/inbox acceptance remain open.
