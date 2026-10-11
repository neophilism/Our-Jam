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
- Migrations 001–007 rehearsed on isolated Neon branch `br-blue-unit-b5rk1hit`. Production branch `br-aged-sea-b55fzq0v` is untouched. Workspace direct Neon DNS failed, so connector rehearsal and CI PostgreSQL tests are distinct evidence.
- No Our Jam service deployed to Render. The October 11 free rehearsal-service creation was rejected: the Hobby workspace has reached its 25-service limit. Project assignment remains unavailable through the connector. Target remains `prj-db5btotckfvc739m1ck0`; see `docs/deployment.md`.
- Engine Room discovery manifest is committed. Actual ingestion is unverified.
- No real generation requests, email deliveries, paid resource creation or production database changes occurred.

## Remaining event gates

Deployment inside the supplied Render project; album files, durations and private core prompts; purchase URL; approved provider/storage credentials and budget; verified free-download rights; exact Soundcore Rave model and audio route; physical iPhone/Android, headphones and long recording rehearsal; venue connectivity/load/recovery checks. The current server-authorized architecture is not end-to-end encrypted and no independent security certification is claimed.

Responsive mobile browsers are implemented. Native iOS/Android builds, email/push delivery, recoverable cross-device accounts, offline console reload, multitrack routing and store submissions remain open. Provider/storage adapters use contract fixtures in CI; browser recording uses a real synthetic Web Audio stream, not physical karaoke microphones. This repository is not yet a show-ready deployed service.

## Show preparation increment

Queue reordering now validates a complete permutation of the remaining queue, with revision checks and command replay. Event/display settings and private album fields can be edited from the performer console. A source becomes immutable when its first round opens, and active rounds retain their copied settings. Browser audio preflight checks file metadata and duration without starting playback; it does not prove complete decoding or physical output routing. See `docs/show-setup.md`.

Native client draft [#11](https://github.com/neophilism/Our-Jam/pull/11) is preserved at `e17818c124b977f62beb660df22b1e0a39c0b563`. CI run `38128094671` passed the core job, native type checks, dependency alignment, iOS/Android JavaScript exports and both native prebuilds. The native audit gate failed on upstream advisories; the PR remains unmerged and is not distribution-ready.

## Release notification increment

PR [#12](https://github.com/neophilism/Our-Jam/pull/12) merged at `69163c03ac6c582aaf0a2710de3be4a0d34c8a37` after CI run `38128764587`: 25 domain/API/media tests, ten desktop/mobile browser scenarios, dependency audit and Docker build passed. It delivers the show preparation increment above.

Optional verified event subscriptions, encrypted contact/message storage, durable deduplicated email dispatch, bounded retries and send caps, unsubscribe, signed bounce/complaint suppression and foreground web release notices are implemented in the release-notification increment. Delivery remains disabled; test providers capture fixtures only. Migration 004 was applied successfully as one versioned transaction on isolated Neon branch `br-blue-unit-b5rk1hit`; production remains untouched. See `docs/release-email.md` for exact semantics, enablement and limits. Native/web push and actual sender/inbox acceptance remain open.

## Artist archive increment

PR [#13](https://github.com/neophilism/Our-Jam/pull/13) merged at `507a959b94446de4365a976560e728242c90ea81` after CI run `38129841845`: 30 domain/API/media tests, twelve desktop/mobile browser scenarios, dependency audit and Docker build passed. Release email remains disabled awaiting approved sender credentials and live delivery rehearsal.

Public artist profiles, music links, filtered event archives, listener-first navigation and guest-scoped liked-track collections are implemented in the archive increment. Reconnect guards disable voting while state is unavailable/stale and prevent old responses from replacing newer snapshots. See `docs/artist-archives.md`; event admission remains open to anyone with the link, and cross-device guest recovery is not yet implemented.

Migration 005 was applied transactionally to isolated Neon branch `br-blue-unit-b5rk1hit`; production is unchanged.

## Local audio resilience increment

PR [#14](https://github.com/neophilism/Our-Jam/pull/14) merged at `ba43b5d62c26fe8eae26849682dd21925d8b2d41` after CI run `38130841019`: 32 domain/API/media tests, sixteen desktop/mobile browser scenarios, dependency audit and Docker build passed. Artist archives, liked-track collections and voting reconnect guards are on main.

The local backup increment adds device-selected album copies with metadata checks, SHA-256 verification and offline album-order continuation in an already open performer console. Entering backup mode stops local show audio and releases server control; the online queue and generation do not advance. Recording gains explicit input selection and disconnect handling. The performer home now lists only its authenticated artist's events. Physical audio, long-session storage/recovery and offline page reload acceptance remain open. See `docs/local-album-backup.md`.

## Artist release review increment

Artist controls now freeze each round's boundary, immediate or review policy; hold publication before or during generation; preview unpublished music through a private operator route; approve publication explicitly; and cancel only work that has never dispatched. Holds survive the final show boundary and provider completion. Cancelled and uncertain jobs retain snapshots and budget semantics. See `docs/release-controls.md` for the migration and rollback barrier: old workers/advance handlers cannot enforce new holds.

Migration 006 was rehearsed transactionally on isolated Neon branch `br-blue-unit-b5rk1hit`. Production remains untouched. The release-control increment passed 34 local domain/API/media tests and the production build; CI and browser approval evidence are tracked in its implementation PR.

PR [#15](https://github.com/neophilism/Our-Jam/pull/15) merged after CI run `38131676715`: 32 domain/API/media tests, eighteen desktop/mobile browser scenarios, dependency audit and Docker build passed. This includes real synthetic local-audio playback with networking disabled and recording-input selection; physical hardware remains unverified.

## Audience admission increment

PR [#16](https://github.com/neophilism/Our-Jam/pull/16) merged at `672ffe7e1ce8ec7a1e4f6299c86e4365cd4ed6d5` after CI run `38131941543`: 34 domain/API/media tests, twenty desktop/mobile browser scenarios, dependency audit and Docker build passed. Private artist review, held publication, explicit approval and never-dispatched cancellation are on main.

Room-code admission, explicit remote voting and transactional contributor capacity are implemented in the admission increment. New performer-created rooms default to code-based voting; existing/API-default rooms preserve open voting. Listeners retain free music and feedback. The test suite exercises simultaneous admission, listener isolation, code rotation and a 100-slot invariant; this is not venue-load certification. Migration 007 was rehearsed on isolated Neon development branch `br-blue-unit-b5rk1hit`. See `docs/audience-admission.md` for deployment and rollback restrictions. The native draft still needs the new admission flow before distribution.

## Visual resilience increment

PR [#17](https://github.com/neophilism/Our-Jam/pull/17) merged at `392efb6ae2c3a6eca90d572c5a9b744c8d9cdc9d` after CI run `38132472499`: 36 domain/API/media tests, twenty-two desktop/mobile browser scenarios, dependency audit and Docker build passed. Admission and remote-listener controls are on main.

Visual controls now remember device/default, light-animation or still-wave preferences. Still mode and reduced-motion preferences avoid loading the Three.js scene; data-saving mode also chooses still waves by default where supported. Hidden or offscreen fields stop their render loops. WebGL context loss falls back to readable waves and preserves the independent voting UI. CI exercises actual browser context loss, continued voting and saved preferences. Frame-rate, thermal, screen-reader and outdoor QR acceptance still need real event hardware.

The native dependency audit was rechecked on October 11 after PR17: upstream braces/node-forge findings still block the native draft; no incompatible forced SDK downgrade or audit bypass was applied. Render service discovery still showed no service tied to this repository, and project-assignment capability/credentials remain the deployment block.

## Deployment and venue-traffic increment

PR [#18](https://github.com/neophilism/Our-Jam/pull/18) merged at `5a67a1f5434e22ca01fc7363d75450cc407aeada` after CI run `38133238780`: 36 API/domain/media tests, 24 desktop/mobile browser scenarios, dependency audit and Docker build passed. Visual preferences and graphics recovery are on main.

Deployment was attempted with a free dedicated rehearsal service, but Render rejected creation at the workspace's 25-service limit. Automatic approval review separately rejected production schema initialization, despite the branch being empty; explicit approval is needed for that migration set. The production branch remains unchanged. The rehearsed development branch now has a restricted SQL runtime role, with its privileges verified. No service or paid resource was created.

The venue-traffic increment separates assets, public reads, session bootstrap and participation budgets; preserves performer login and admission limits; bounds and coalesces snapshot work without retaining completed results; and disconnects slow invalidation streams. Deterministic tests exercise 100 real database guest identities at one address. This is not a deployed capacity claim. See `docs/live-traffic.md`.
