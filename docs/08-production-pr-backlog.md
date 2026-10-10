# Production pull request register

All 42 entries are planned, not implemented. Dependencies are minimum prerequisites; numerical order is the default. Read DEVELOPMENT_PLAN.md for universal merge gates. Each PR must update repository progress and the relevant feature specification.

## P001 Repository and operating contract

Phase: Foundation. Dependencies: none.

Scope: Create the monorepo, plans, ADR index, progress log, credential inventory, contribution rules and Engine Room registration record.

Acceptance: A new developer can identify every service, planned PR, environment and next action without chat history.

Verification: Check documentation links and clean bootstrap; record Engine Room access or pending sync.

Rollout: Documentation only; no deployment or new spending.

## P002 Provider audio and security feasibility

Phase: Foundation. Dependencies: P001.

Scope: Benchmark candidate generation within approved credits; obtain applicable rights evidence; inspect exact Rave routing; map the full security standard to data flows.

Acceptance: Record a supported provider route, measured latency sample, recording tier and explicit unresolved launch gates.

Verification: Real provider request and file playback, physical mic capture test, account entitlement and trust-boundary review.

Rollout: Keep live generation disabled until G0 evidence passes.

## P003 Domain contracts and initial schema

Phase: Foundation. Dependencies: P001.

Scope: Define artist, event, source track, round, wave, allocations, jobs, releases and outbox schemas; add versioned API and event contracts.

Acceptance: Tenant relationships and uniqueness constraints exist; migration applies to an empty database and upgrades the prior schema.

Verification: Migration integration, schema compatibility and cross-tenant foreign-key negative tests.

Rollout: Use additive migrations; rollback app code without dropping collected data.

## P004 Continuous integration and staging infrastructure

Phase: Foundation. Dependencies: P001, P003.

Scope: Add build, lint, type, domain-test and security checks; Render deployment configuration; isolated Neon staging and secret references.

Acceptance: A commit deploys to the correct staging project with health checks and no production data or secrets in previews.

Verification: Deploy smoke test, wrong-environment guard and synthetic fixture inspection.

Rollout: Use only authorized resources; disable automatic production rollout during live events.

## P005 Guest identity accounts and role boundaries

Phase: Foundation. Dependencies: P003, P004.

Scope: Implement guest sessions, recoverable accounts, artist memberships, display pairing and scoped performer and moderator roles.

Acceptance: Tabs share one budget identity; privilege escalation and unauthorized artist access are rejected.

Verification: Session lifecycle, CSRF/origin, expired token and role-matrix integration tests.

Rollout: Feature flag guest linking; preserve existing guest participation on rollout.

## P006 Artist album and event preparation

Phase: Foundation. Dependencies: P005.

Scope: Build artist profile, source-track metadata, core prompt versions, set order, event settings and spending/participation caps.

Acceptance: Artist can configure a complete event; invalid prompts or missing assets prevent arming the show.

Verification: Setup E2E, validation and cross-artist write tests.

Rollout: Configuration versioning; event settings are snapshotted when armed.

## P007 Durable media ingest and local album cache

Phase: Foundation. Dependencies: P002, P006.

Scope: Add scoped uploads, object storage, media inspection, waveform metadata and show-laptop download/cache management.

Acceptance: Original album stays private unless explicitly published; cached tracks are verified playable before readiness is green.

Verification: Interrupted upload, malformed media, checksum, storage access and offline cache tests.

Rollout: Keep immutable originals; expire only incomplete uploads under a documented policy.

## P008 Playback leader queue and round lifecycle

Phase: Crowd. Dependencies: P003, P006, P007.

Scope: Implement the sole playback leader, ordered queue commands, gapless scheduled boundaries, heartbeat, pause, skip, replay and inserted-track policy.

Acceptance: Each eligible source track opens and closes one round; stale leadership suspends generation and local music continues.

Verification: Clock, duplicate boundary, two-leader, pause/seek and disconnect integration tests plus audible transition check.

Rollout: Expose album-only mode; new epochs fence off stale controllers.

## P009 Atomic five-point voting

Phase: Crowd. Dependencies: P005, P008.

Scope: Implement complete allocation replacement, expected revisions, command deduplication, atomic submission vote and zero-support disappearance.

Acceptance: No sequence of concurrent requests exceeds five points or accepts votes after the cutoff.

Verification: Randomized invariant tests, concurrent tabs and vote-versus-close transaction races.

Rollout: Additive counters with reconciliation; disable mutation on invariant alarms.

## P010 Wave moderation and duplicate handling

Phase: Crowd. Dependencies: P009.

Scope: Normalize exact duplicates, limit text, enforce core constraints, protect supported phrases from edits and add moderator controls.

Acceptance: Unsafe or invalid phrases never reach public rendering; removing a wave returns points consistently.

Verification: Injection, Unicode, duplicate, moderated allocation and creator-edit tests.

Rollout: Retain audit and undo where appropriate; fail closed for unvalidated new text.

## P011 Durable realtime subscriptions and recovery

Phase: Crowd. Dependencies: P009, P010.

Scope: Ship WSS subscriptions, transactional outbox delivery, sequence replay, snapshot fallback and public-screen filtering.

Acceptance: An acknowledged vote survives an API restart; reconnects produce an accurate view without duplicate actions.

Verification: Crash after commit, duplicate delivery, event gap and unauthorized subscription tests.

Rollout: Backpressure and polling fallback; replay schema remains compatible.

## P012 Audience web app and stable voting controls

Phase: Crowd. Dependencies: P011.

Scope: Build QR join, live round header, submission, five-point controls, searchable ranked waves, guest profile and pending/error states.

Acceptance: A real iPhone and Android browser can join and vote; animation never moves the active input control.

Verification: Mobile E2E, keyboard/VoiceOver/TalkBack flow and poor-network recovery.

Rollout: Roll out on a private rehearsal event first; core list works without 3D.

## P013 Production screen and baseline 3D waves

Phase: Crowd. Dependencies: P011, P012.

Scope: Implement luminous wave bodies, bounded size/rank motion, readable labels, beat envelope input, screen cap and fixed free/buy QR zones.

Acceptance: Real votes animate on the screen; sparse and crowded scenes fill the field without overlap or unreadable controls.

Verification: Actual display-distance and QR tests; reduced motion, context loss and frame-time benchmark.

Rollout: Quality presets and automatic 2D fallback; no simulation in public production events.

## P014 Generation adapter durable jobs and cost reservation

Phase: Generation. Dependencies: P002, P004, P007, P010.

Scope: Add provider capabilities, leased jobs, paid-request lifecycle, budget reservations, request lookup and UNKNOWN reconciliation.

Acceptance: Retrying a worker cannot blindly issue a second paid generation; cost caps survive restarts.

Verification: Provider fixture tests plus approved live call, timeout-after-acceptance and worker-kill scenarios.

Rollout: Live provider feature flag; preserve unknown jobs for operator review.

## P015 Prompt compiler and boundary dispatch

Phase: Generation. Dependencies: P008, P009, P010, P014.

Scope: Freeze ranked snapshots, preserve the core, apply actual provider limits, save inclusion reasons and enqueue one generation.

Acceptance: UI and payload share rank order; complete waves fit without truncating the core; each closed round has one generation identity.

Verification: Golden payload, Unicode budget, tie, incompatible-wave and close/dispatch integration tests.

Rollout: Version prompt compiler; rollback never rewrites a frozen prompt.

## P016 Validated synchronized releases and downloads

Phase: Generation. Dependencies: P007, P011, P014, P015.

Scope: Validate outputs, retain originals, upload durable assets, release ready jobs at boundaries or as-ready, and drain at set end.

Acceptance: A published release is playable and downloadable before its notification; late jobs do not delay stage audio.

Verification: Partial file, invalid audio, failed upload, duplicate publish and final-set drain tests.

Rollout: Publication kill switch and artist hold; assets remain immutable.

## P017 Listener player and trustworthy play metrics

Phase: Generation. Dependencies: P012, P016.

Scope: Add user-initiated audio, seek/resume, range delivery, listened intervals, unique listener and qualified-play metrics.

Acceptance: Counts distinguish starts from actual listening; a seek does not qualify a full play or completion.

Verification: Media E2E, repeated heartbeat, seek, mute/preview labeling and network recovery.

Rollout: Version metric definitions; retain bounded events for aggregate reconciliation.

## P018 Reactions comments and listening prompts

Phase: Generation. Dependencies: P010, P017.

Scope: Add one mutable like/dislike, comment reporting and moderation, and nonblocking completion or greater-than-half navigation prompts.

Acceptance: Votes toggle idempotently; OS termination defers feedback to next visit; downloading never requires a rating.

Verification: Navigation, exact-half boundary, duplicate reaction, harassment-report and delete-own tests.

Rollout: Comments and feedback prompt can be independently disabled.

## P019 Release email push and preferences

Phase: Generation. Dependencies: P005, P016, P017.

Scope: Add verified-email event subscriptions, foreground notifications, supported web push, preferences and delivery outbox.

Acceptance: Each opted-in recipient gets at most one logical release notification per channel; email works alongside app push.

Verification: Bounce/unsubscribe, retry/deduplication, denied permission and iOS browser-versus-installed tests.

Rollout: Provider spending cap, channel kill switch and event digest fallback.

## P020 Performer feedback dashboard and Play next

Phase: Performance. Dependencies: P008, P016, P017, P018.

Scope: Expose real-time popularity with sample size, source lineage, favorites, private preview entry and ordered queue insertion.

Acceptance: Play next is one action with undo; repeated requests do not duplicate a track or interrupt the current song.

Verification: Two-controller queue conflicts, last-second insertion and unready-asset E2E.

Rollout: Only validated cached media is eligible; next album item remains fallback.

## P021 Private headphone cue and audio diagnostics

Phase: Performance. Dependencies: P002, P017, P020.

Scope: Ship phone headphone preview and desktop capability detection, distinct cue/public buses and routing diagnostics.

Acceptance: Cue is physically inaudible on the public speaker and excluded from public recording and popularity counts.

Verification: Exact OS/browser/device routing test, output change and cue-network-failure rehearsal.

Rollout: Default to phone cue; desktop multi-output stays gated until verified.

## P022 Recoverable recording and hardware tier support

Phase: Performance. Dependencies: P002, P007, P008, P021.

Scope: Implement input selection, meters, channel/codec detection, chunk capture, local manifest, resumable upload and tier labels.

Acceptance: Capture recovers completed chunks; the declared Rave or alternate interface route is demonstrated or clearly marked unsupported.

Verification: Continuous real input test, storage pressure, crash, unplug and upload resume; listen to recovered audio.

Rollout: Private recordings by default; room-record fallback is explicit and does not close the clean-mic requirement.

## P023 Profiles avatars and core leaderboards

Phase: Performance. Dependencies: P005, P015, P016.

Scope: Add musical seeded avatars, optional uploads, anonymity, event/weekly/monthly/all-time boards and release-settled credits.

Acceptance: Changing votes cannot farm points; public anonymity propagates; failed generations do not count as released contributions.

Verification: Ledger recomputation, timezone boundaries, profile sanitization and hide-track tests.

Rollout: Rebuildable aggregates and independent leaderboard visibility switch.

## P024 Artist pages event archives and album commerce

Phase: Performance. Dependencies: P006, P016, P017, P023.

Scope: Create public artist/event pages, remote listen mode, explicit remote-voting option, original album purchase links and event track lists.

Acceptance: Both QR codes resolve persistently; remote rules are visible; purchase clicks are not counted as sales.

Verification: Late-arrival, archived event, external-link safety and remote-admission tests.

Rollout: Use existing storefront; native commerce decisions remain deferred to store review.

## P025 Security privacy and content release review

Phase: Performance. Dependencies: P005, P010, P018, P019, P022, P024.

Scope: Complete trust-boundary evidence, authorization matrix, deletion/export, contact consent, recording permissions and incident/takedown controls.

Acceptance: No unresolved critical access or secret issue; actual encryption boundaries are recorded without unsupported compliance claims.

Verification: Tenant isolation, SSRF/XSS/CSRF, signed asset, deletion and secret-scan gates.

Rollout: Close unsafe surfaces; preserve necessary audit records with documented retention.

## P026 Load monitoring recovery and full show rehearsal

Phase: Performance. Dependencies: P013, P019, P020, P021, P022, P023, P025.

Scope: Add dashboards, alerts, event cost telemetry, load profiles, deployment freeze, backup/restore and show checklist.

Acceptance: The declared attendance cap, offline playback, generation failure and recording recovery pass on the actual setup.

Verification: At least a full set rehearsal; load at twice planned attendance, restore and worker/API restart exercises.

Rollout: Admission cap and listen-only degradation; record exact limitations.

## P027 First production event release gate

Phase: Performance. Dependencies: P026, P024.

Scope: Promote the tested commit, verify project-specific production resources, run smoke tests and package operator runbook and evidence.

Acceptance: G0–G4 pass; release notes name the supported hardware and enabled features; no first-show promise if gates are red.

Verification: Production QR-to-vote-to-generation-to-download-to-cue smoke test with bounded credits.

Rollout: Rollback app to last known good commit; no destructive schema downgrade; traditional-show fallback.

## P028 Cinematic wave rendering and visual identity

Phase: Complete V1. Dependencies: P013, P027.

Scope: Refine custom deformation, lighting, depth, filaments, transitions, event palettes and audio-driven independent motion.

Acceptance: Scene meets the desired living 3D aesthetic without losing readability or stable controls.

Verification: Visual review on show display and representative phones; long thermal/performance session.

Rollout: Ship graded presets and visual feature flags.

## P029 Dense crowds adaptive layout and discovery

Phase: Complete V1. Dependencies: P028, P011.

Scope: Support high submission volume, overflow representation, rank-stable discovery, venue presets and screen-size controls.

Acceptance: All eligible waves remain discoverable while only the configured number have readable labels.

Verification: 10/100/1000-wave scenarios, rapid rank churn, search access and projection-distance tests.

Rollout: Participation cap remains distinct from visual capacity.

## P030 Advanced recognition and leaderboard analytics

Phase: Complete V1. Dependencies: P023, P029.

Scope: Add release receipts, Late breakout and Early spark criteria, per-round averages and anti-farming analysis.

Acceptance: Every award is reproducible from stored evidence and does not alter voting weight.

Verification: Ledger replay, duplicate author, late-wave and minimum-sample tests.

Rollout: Version awards; preserve historic rule version.

## P031 Fan collections following and return journeys

Phase: Complete V1. Dependencies: P019, P024, P030.

Scope: Build follows, personal favorites, event collections, consented future-event reminders and shareable contribution receipts.

Acceptance: Fans can return directly to their artist and contributions without exposing private identity.

Verification: Account link/recovery, consent, unfollow and private/public sharing tests.

Rollout: Default marketing off; notifications obey saved preferences.

## P032 Native iOS and Android foundation

Phase: Complete V1. Dependencies: P005, P012, P027.

Scope: Add Expo applications, secure credential storage, shared domain/contracts, build signing and deep-link foundations.

Acceptance: Installable internal builds on both platforms authenticate against staging with no embedded secrets.

Verification: Real-device install, login/logout, token expiry and contract parity checks.

Rollout: Internal distribution first; store credentials remain project-specific.

## P033 Native voting profiles and optimized visualization

Phase: Complete V1. Dependencies: P029, P031, P032.

Scope: Implement Live, Tracks, Leaders and You with mobile wave renderer and accessible stable controls.

Acceptance: Native budgets and rankings match web; thermal limits degrade effects without disabling play.

Verification: iOS/Android parity E2E, VoiceOver/TalkBack, reconnect and device GPU tests.

Rollout: Keep list fallback; feature parity tracked per platform.

## P034 Native audio offline downloads and media sessions

Phase: Complete V1. Dependencies: P017, P032, P033.

Scope: Add background playback, explicit downloads, local file management, lock-screen controls and interruption handling.

Acceptance: Downloaded public tracks play offline; phone calls and output changes preserve recoverable playback state.

Verification: Real devices, screen lock, airplane mode, storage full, Bluetooth change and app restart.

Rollout: Quota-managed local storage; private media is not accidentally made public.

## P035 Native notifications and event deep links

Phase: Complete V1. Dependencies: P019, P032, P034.

Scope: Integrate APNs/FCM or approved Expo push route, token lifecycle and release/account deep links.

Acceptance: Release taps resolve the correct public track and preferences suppress unwanted notices.

Verification: Foreground/background/terminated app tests, invalid token receipts and duplicate delivery.

Rollout: Push kill switch; email and foreground feed remain independent.

## P036 Store readiness privacy and user content review

Phase: Complete V1. Dependencies: P025, P033, P034, P035.

Scope: Complete store metadata, account deletion, reporting/blocking, privacy declarations, age policy and regional purchase-link decisions.

Acceptance: Both builds satisfy documented current submission requirements with usable reviewer access.

Verification: Policy checklist against official sources plus real-device release builds and accessibility review.

Rollout: Staged release after actual approval; approval timing is external.

## P037 Advanced recording exports and live performance releases

Phase: Complete V1. Dependencies: P022, P025, P034.

Scope: Complete multichannel support on verified hardware, alignment/export, performer permissions and separate rap-version publishing; decide on companion app only if tests require it.

Acceptance: Backing and vocal channels are correctly identified where available; public release requires the distinct recording workflow.

Verification: Long recording/drift/recovery tests, consent revocation before publish and manifest import.

Rollout: Private originals retained; publish new versions rather than overwriting raw takes.

## P038 Artist onboarding quotas and cost administration

Phase: Complete V1. Dependencies: P024, P025, P031.

Scope: Add self-service artist configuration, resource quotas, usage statements and administrator cost controls; billing integration remains optional until business terms are chosen.

Acceptance: Multiple artists remain isolated and one event cannot exhaust another artist's authorized budget.

Verification: Multi-tenant concurrency, cap enforcement and cost reconciliation tests.

Rollout: No paid audience voting; newly billable services require spending approval.

## P039 Event album export and distributor handoff

Phase: Complete V1. Dependencies: P016, P023, P024, P037.

Scope: Create sequenced audio/artwork/credits packages with rights and AI metadata, and a distributor adapter only if an authorized API is confirmed.

Acceptance: An event can become a reviewable distribution package; DSP delivery is never described as instantaneous.

Verification: Export validation, checksum/metadata review and a sandbox integration if available.

Rollout: Manual export is supported; no automatic external submission without authorization.

## P040 Horizontal scale and high attendance validation

Phase: Complete V1. Dependencies: P026, P029, P038.

Scope: Add shared fanout coordination when needed, tune database access and certify larger declared event capacities.

Acceptance: Multiple API instances cannot diverge votes or leader state; 1000-participant target is enabled only after measured success.

Verification: Cross-instance reconnect, burst load, noisy-artist isolation and database saturation tests.

Rollout: Canary rollout and admission caps; broker is not sole vote storage.

## P041 Disaster recovery and provider continuity

Phase: Complete V1. Dependencies: P014, P026, P039, P040.

Scope: Automate reconciliation and restore drills; add a second provider only if approved for rights, cost and sound; document key rotation and vendor outage handling.

Acceptance: An operator can recover published assets and state; provider uncertainty cannot trigger duplicate charges.

Verification: Isolated disaster restore, credential rotation and primary-provider outage exercise.

Rollout: Failover off by default until approved and rehearsed.

## P042 Complete production V1 acceptance

Phase: Complete V1. Dependencies: P028, P029, P030, P031, P036, P037, P038, P039, P040, P041.

Scope: Run full requirements traceability, real show acceptance, native/store deployment evidence and post-event operational review.

Acceptance: All V1 requirements are implemented or expressly documented as hardware/provider-dependent limitations accepted for a supported configuration.

Verification: Cross-platform and live-hardware acceptance matrix, production smoke, security and restore evidence.

Rollout: Tag release, retain rollback plan and move unresolved optional integrations into explicit later work.
