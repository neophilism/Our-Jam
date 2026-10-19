> **OJ-010 PR #100 in progress:** The mapped draft branch implements creator Sound Wave editing before other listeners support a phrase, frozen artist phrase exclusions, contact-detail rejection, live operator hide/review controls, and returned-vote revisions. The current-head application and hosted checks are pending. This PR has not been merged or deployed. Rollback is a code revert; no schema migration or paid provider change is included. Real event content moderation still needs venue-level observation.

> **Further October 16 acceptance:** PR #39 passed exact-head application, browser, audit and Docker checks and merged as `bcbb05b`. Its live Render startup completed an isolated private S3 PUT/HEAD/GET/DELETE with `media: verified`; Neon confirmed no remaining diagnostic objects. PR #40 passed both hosted security smoke and full CI, merging as `014b991`. The hosted smoke now checks unauthenticated private endpoint denials, cross-origin mutation rejection, mobile browser entry and verified media status. These results do **not** establish a physical phone, owner-song upload, paid generation, or venue acceptance; those gates are tracked in [hosted rehearsal runbook](docs/hosted-first-rehearsal.md). Human independent review remains a final follow-up, not a development blocker.

> **October 16, 2026 continuation:** The October 12 evidence below is retained. Render hosts a live zero-spend rehearsal API using restricted credentials on the isolated Neon rehearsal branch. Merged PRs #37-#38 fixed the canonical CI registry and added external hosted health/readiness checks. Merged PRs #39-#42 added startup S3 PUT/HEAD/GET/DELETE, real presigned HTTPS download, unsigned private-object denial, hosted access-control/Origin smoke, and operator-facing readiness/runbook. Deployed commit `4561b6c` logged `media=verified` and `generation=not_configured` on October 16, while the hosted smoke passed on the PR and main. Owner-uploaded songs and two physical phones/venue hardware have NOT been accepted. Production schema remains untouched; human security audit remains final-stage follow-up without blocking ongoing technical testing.

# Our Jam implementation progress

Updated October 12, 2026 after merged PR30, PR32 and PR34. The approved scope remains **54 work packages** in [registry/roadmap.json](registry/roadmap.json), with original dependencies and acceptance in [backlog.json](backlog.json). Implementation PRs are not completion percentages. The preceding progress record is preserved byte-for-byte in [history](docs/history/progress-before-oct12-continuation.md); its older history link remains separately available in [the earlier record](docs/history/progress-before-dual-provider.md).

## Verified changes in this continuation

| PR | Exact accepted head | Successful runs | Merged commit |
| --- | --- | --- | --- |
| 30: native profile recovery and following | 6c66b928f66ad0a513abd711e277773b1e3f03d1 | Application 38318745155; actual native/Simulator-to-stage 38318745320 | 468d97602fc1829642c3d090a967310e1d8e1dc7 |
| 32: native keyboard and private playback lifecycle | 3a0960cfb55c324efd6deaab42327d1eee85189d | Application 38319841295; actual native/Simulator-to-stage 38319841240 | 2007b54e8703878fa25a5638c7c09aadab5bf6d8 |
| 34: saved Mureka task reconciliation | 213423f51573271f91a86d9d5bc1a53f28c56d63 | Full application/browser/audit/build/Docker 38321083274 | a880d149579ec91f96a9a0c73690452b382a48da |

Each merge followed successful checks and GitHub mergeability confirmation. Dependent branches integrated the actual merged parents without force replacement. PR34's original head db9ebdd99cbfeece956547d4b84bb7ab1fe35edf also passed full run 38320555681 before final integration with accepted PR32. This progress update has its own checks under PR35; it does not alter the runtime code or predeclare its own check result.

### Native failure corrected, not waived

The earlier native recovery test reached a real Simulator and found a disclosure that disappeared before the fan could save the key. Recovery state and its sheet now belong to the stable profile navigation container, not a changing lazy Form section. The actual UI regression requires the same key to survive a snapshot-refresh interval, a hittable save confirmation, explicit dismissal, relaunch/restoration of the real profile and its follow state. Keys are transient UI state; device credentials remain in origin-scoped Keychain. Lifecycle/API/origin/event guards prevent late disclosure after departure.

PR32 additionally verifies Sound Wave keyboard dismissal during real native participation, pauses private playback on inactivity and removes a withdrawn release after a fresh snapshot. The two actual native tests passed. The accepted screenshot shows the keyboard absent and the submission with two stored points; the actual public-screen screenshot and JSON match that submission. These are isolated CI events, not data seeded into user startup.

Latest accepted universal Simulator package: artifact **11779117570**, from run **38319841240**, SHA-256 `3280ef05fc66ff7729cec9bcc1807f890c2e8a8458420b86e7a8b0c59626882f`. Evidence artifact **11778592991** retains screenshots, matching JSON and test logs; the native and stage images were visually inspected. Both Simulator architectures compiled. Interaction evidence is iPhone SE (3rd generation), iOS 26.2, not a physical iPhone, Android, TestFlight or store release. The package contains the source used by that run and predates the later backend reconciliation increment; do not relabel it as the latest complete source bundle.

### Existing paid task recovery without a new paid request

PR34 adds **Check existing task** to the private performer generation panel. The strict, owning-artist, exact-Origin, revision-fenced and replay-safe command queues inspection of a saved UNKNOWN Mureka receipt. A separate explicit resume capability performs GET-only lookup of the existing task and its approved audio URL. Missing receipts, changed models and providers without that capability cannot silently submit a replacement.

The worker retains the original paid attempt, attempt count and reservation. Exact database lease fencing prevents late workers from replacing newer state; content-hashed object paths prevent differing stale bytes from replacing a published asset. Existing audio validation, holds and publication policy remain intact. The current **$0** allowance blocks both requesting and dispatching reconciliation. There were no live provider calls.

Seven added provider/API/worker tests passed, covering GET-only lookup, concurrent replay/workers, one attempt/reservation/release, zero-budget gates, unsupported/mismatched receipts, stale-worker races and authentication/Origin/revision/privacy. Desktop/mobile browser acceptance used an explicitly isolated UI receipt fixture; actual SQL-backed tests exercised the backend. All existing application, browser, dependency-audit, build and Docker gates passed on the final integrated head. See [reconciliation and rollback](docs/generation-reconciliation.md).

## Production schema now initialized; hosting still unavailable

The owner explicitly requested another deployment attempt. The normal Render free-service creation action was tried again for the dedicated Our Jam rehearsal service in the confirmed workspace and was again rejected by the tool safety check before creation. It was not rerouted. **No Our Jam hosted service, deployed commit or public URL is established.** The obsolete service-count explanation and missing-approval claims must not be substituted for this observed rejection.

The previously approved production migrations **001-008 succeeded** on Neon project `crimson-hat-87508124`, branch `br-aged-sea-b55fzq0v`, database `neondb`, under an advisory transaction lock and an empty-public-schema guard. Read-back showed eight migrations and zero events, participants, generation jobs and email jobs. Only the migrations' baseline artist and dispatch-control row were inserted. Neon schema comparison with rehearsal branch `br-blue-unit-b5rk1hit` returned an empty diff.

The production `our_jam_app` role is prepared with application DML/sequence permissions and read-only migration history. It remains **NOLOGIN**, with no production password issued. Inspection confirmed no superuser, role/database creation, RLS bypass, public-schema CREATE or migration-history INSERT. A subsequent SET ROLE test was denied to the connector's current role; no extra membership was granted. Privilege inspection and schema preparation are not runtime-login or deployed-connection acceptance.

Private `our-jam-media` Object Storage remains on the isolated rehearsal branch. Real hosted ingestion/delivery and runtime credential wiring are unverified. The earlier unused temporary storage credential was revoked. See [resource state](docs/rehearsal-resource-state.md), [deployment](docs/deployment.md) and [initialization evidence](docs/progress/2026-10-12-production-initialization.md). Do not reinitialize the now-populated schema or ask the owner to repeat the same broad migration approval.

## Existing accepted rehearsal baseline

Merged PR23 added frozen Mureka/Stable Audio choice and exact STABLE_AUDIO_KEY support. PR24 added actual MP3/WAV ingestion, full decoding, measured duration, private storage and authenticated playback. PR25 added the actual SwiftUI app plus a persistent empty-start same-Mac API. PR28 added automatic local deadlines/controller recovery and graceful shutdown; PR29 added the actual monitor window and connection fields; PR31 added prerequisite and dependency-install repairs. Their exact evidence remains in the preserved historical record.

Local startup creates no demonstration events, songs or votes. The owner supplies real files and Sound Waves. The API binds only `127.0.0.1`, with PGlite and private audio under `~/.our-jam-local`; it uses no provider/cloud credentials. Separate physical audience phones cannot reach that loopback address. Ordinary performer/audience/screen routes remain `/performer`, `/event/:slug` and `/screen/:slug`.

Uploads produce 192 kbps MP3 playback derivatives, not retained original masters, with a 128 MiB input cap and catalog duration limits. Private local storage is capped at 1 GiB. OS file permissions are not application encryption. Physical audio routing, long recording, multitrack capture and venue capacity remain separate hardware acceptance.

## Remaining full-scope gates

The spending limit is still **$0**, not an automatic Thursday allowance. Reported GitHub secrets MUREKA_API_KEY and STABLE_AUDIO_KEY have not been read or validated through live music requests and are not established as Render runtime variables. No paid provider request, real email, paid cloud resource or Apple membership purchase occurred.

Hosted service creation/runtime wiring, real private-media delivery, funded provider rights/billing/quality/latency, physical phones and show rehearsal remain open. Android/Expo dependency remediation, native offline/background/push, detailed feedback/recognition, remaining exports/administration/scaling and the rest of full V1 remain development work, not merely funding blockers. DJ and demonstration scope remains after V1 under the original plan.

E2EESA implementation, full security testing and qualified independent exact-source review remain pending in the source-owned status record. Reading the pinned standard and passing product tests are not independent certification. The rejected SET ROLE check and missing runtime/service evidence were not waived.

Engine Room's registry/prs.json remains a historical as-of snapshot. Current implementation evidence is this record, the canonical roadmap and actual PR/check results; live Engine Room ingestion has not been verified. Application CI preserves an exact checked source archive after all its gates pass. That archive is not a native binary and does not relax the independent native or production-release gates.
