# Security reliability operations and validation

## Trust and privacy design

Public waves, selected public credits and released music are intentionally shared. Account contacts, private core prompts, unreleased audio, microphone recordings, administration and credentials are restricted. Model these classes explicitly in storage and API responses. Public names are display choices, not authentication identifiers.

Apply encrypted transport, server certificate verification, least-privilege service credentials, restricted administration, protected secrets and verified encryption at rest. Inventory every hop: client to edge, edge to application, application to worker/database/object storage, provider exchange, recording upload, notification vendors and backups. Verify the actual guarantees of the selected hosting setup; do not assume a private network alone meets the user's End-To-End-Everywhere standard.

Traditional end-to-end encryption cannot simultaneously keep plaintext hidden from a server and let that server moderate it, rank its text and send it to a generator. Document necessary decryption boundaries. Encrypt sensitive private data with managed keys and rotation; do not label that true client-to-client E2EE. Consider an optional artist-only encrypted recording vault later, with explicit sharing and key recovery rules, if the user's full standard requires it. Public releases are separate intentional disclosures.

Provider keys never enter browsers or mobile builds. Use scoped, expiring media permissions for uploads and private recordings; public downloads require an explicit release flag. Treat arbitrary media URLs and uploads as untrusted: allowlist provider fetch destinations, prevent SSRF, cap sizes and durations, inspect actual file types, strip image metadata and sanitize names and comments.

## Authorization and abuse controls

Use roles for artist owner, performer, moderator, read-only display and participant. Require stronger authentication for ownership, billing and security changes. Pair displays with revocable, narrowly scoped tokens. Verify authorization on every command and subscription, and test artist A against artist B even if the UI never offers that route.

Protect sessions against CSRF where cookie authentication is used, XSS, replay and fixation. Validate WebSocket origins and sessions; do not place long-lived secrets in QR URLs or loggable query strings. A shared display cannot mint generation jobs or reveal private recordings. Rate limits distinguish guest participation, authenticated moderation and public media delivery.

Moderate Sound Wave text before it becomes public or reaches the generator. Start with length limits, restricted formats, artist exclusions and obvious abuse checks; add an appropriate moderation provider when needed. Include hide/report/mute/appeal paths. Comments and uploaded avatars need moderation too. Keep human intervention available without requiring the artist to approve every ordinary wave.

## Rights and consent records

Record that the artist can upload the source album and submit any reference assets for processing. Participant terms should explain that musical suggestions may influence public generated releases and that public credit is optional. Do not promise collaborators automatic royalties or copyright ownership. Define download permissions separately from future commercial reuse and use qualified legal review for final terms when necessary.

Record versioned consent for contact and for publishing live microphone performances. Keep recording notices understandable at the event and obtain required performer permissions before public release. A child-appropriate event, age restrictions and store age ratings need an explicit policy before public launch; do not collect unnecessary birth dates to solve a problem that can be handled through the chosen audience policy.

Deletion anonymizes public participation where appropriate, removes private account and contact data subject to legitimate retention duties, and clears vendor subscriptions. Already downloaded public music cannot be recalled from every device; explain that when publishing. Maintain a takedown process and an artist-controlled visibility switch.

## Reliability and observability

Monitor connection count, command latency, vote conflicts, accepted/rejected votes, leader heartbeat age, generation queue depth, UNKNOWN jobs, generation cost, validation failures, published assets, notification failures, recording chunk gaps and audio underruns. Use correlation IDs from event through round, generation and release, with redaction of personal content and secrets.

Use a durable outbox, leased jobs, bounded retries, circuit breakers and reconciliation tasks. Separate platform outages from local network trouble. Do not rely on in-memory timers to remember a show after a process restart. No scheduler is created for autonomous development; application maintenance jobs, when built, are ordinary documented product infrastructure.

Freeze production deployments during a live event unless an operator chooses a tested emergency fix. Cache the album, queue and essential event configuration locally. Votes submitted offline remain pending and expire at cutoff; never report a vote accepted before the server accepts it. During an extended outage keep music and local recording running, stop misleading generation promises and display a readable recovery state.

Back up metadata and protect published originals. Rehearse restoring into an isolated environment and repointing a test client. State the actual retention and recovery objectives supported by the chosen plans. An initial target is at most 15 minutes of metadata loss in a disaster and service recovery within 60 minutes, but these are goals that may require paid resources. A normal process restart should lose no committed vote.

## Cost and capacity model

Reserve generation budget before dispatch and enforce per-event, per-artist and global caps. Configure max duration, max concurrent jobs, max attempts and total event spend. Notify at configurable thresholds such as 70 and 90 percent; stop new paid submissions at the cap while keeping the album and existing downloads working.

For planning, event generation cost equals the number of eligible rounds times outputs per round times billable duration/rate, plus approved retries. Add hosting, storage, audio processing, delivery bandwidth and email. These are formulas, not quotes. Obtain current account pricing and spending authorization before provisioning new paid services.

A three-minute file at 192 kilobits per second is about 4.32 MB before container overhead. Ten such tracks downloaded once by 100 listeners is roughly 4.32 GB; 1,000 listeners is roughly 43.2 GB. Delivery bandwidth can exceed the generation cost. Use a CDN where approved, HTTP range support and idempotent tracking, and do not stream every file through the Node API.

Start with a declared 100-participant event profile and test at twice the expected attendance before enabling that capacity. A larger 1,000-participant profile requires its own load evidence. Visible wave count is not the participant cap. Define admission behavior and a listen-only fallback rather than letting overload corrupt the game.

## Acceptance targets and evidence

| Area | Proposed target or invariant | Evidence required |
| --- | --- | --- |
| Vote integrity | Zero budgets above five or post-cutoff accepted writes | Concurrency and randomized state-transition tests |
| Realtime | Vote acknowledgment p95 below 500 ms; displayed update p95 below 1 second on test network | Load run with actual deployment and reconnects |
| Publication | No release points at incomplete media; no duplicate logical release | Crash injection and duplicate callback tests |
| Jobs | No blind resubmission of an uncertain paid request | Provider timeout/reconciliation test |
| Playback | Continuous cached album playback during a 10-minute connectivity loss | Real laptop and speaker rehearsal |
| Visuals | 60 fps show target and stable 30 fps phone target | Actual resolution, device and thermal trace |
| Cue isolation | No private preview audible on public output or recording | Physical routing test |
| Recording | Completed chunks recover after forced crash | Real input capture and recovery exercise |
| Access control | No cross-artist read, write, subscription or asset leakage | Negative authorization matrix |
| Accessibility | Core flows work with keyboard, VoiceOver, TalkBack and reduced motion | Automated checks plus manual device review |
| Recovery | Documented restore and rollback work | Isolated restore and deployment exercise |

These targets are not service guarantees and are not verified by this plan. Test meaningful behavior rather than implementation-shaped assertions. Required checks include domain units, transaction integration, migrations, provider contract fixtures, representative E2E, accessibility, dependency/secret scans and production smoke tests. Mock providers support deterministic CI; real provider checks remain distinct and use bounded approved credits.

## Native distribution

Expo supplies cross-platform audio and notification capabilities, but platform configuration and real-device validation remain necessary [S14, S15]. Test audio interruptions, Bluetooth changes, lock screen, downloads, app restart and notification deep links. Store approval and account access have external lead times and cannot be guaranteed by Wednesday.

Before native submission, review current Apple and Google policies for user-generated content, account deletion, privacy disclosures and digital-music purchase links in each market [S16, S17]. Keep the web checkout available; do not assume a universal external-purchase button is allowed in both native stores. Ship reporting and blocking paths, accurate permission text and a support contact.

