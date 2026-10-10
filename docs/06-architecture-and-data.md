# Production architecture and data contracts

## Application structure

Use a TypeScript monorepo with a React web application, a Node API/realtime service, a background worker, and an Expo React Native client added within V1. Keep web fan, screen and performer surfaces in one application initially, with separate routes and authorization. Select supported stable library versions at implementation and pin them in the lockfile; do not treat this plan as a version compatibility claim.

| Area | Responsibility |
| --- | --- |
| apps/web | QR entry, audience PWA, public screen, performer console and artist pages |
| apps/api | Identity, authorization, rounds, votes, realtime, playback commands and metadata |
| apps/worker | Generation dispatch, media validation, exports, email and notification jobs |
| apps/mobile | Native iOS and Android fan and performer-control experiences |
| packages/domain | Pure voting, ranking, prompt, timing and scoring rules |
| packages/contracts | Validated requests, responses, events and API compatibility definitions |
| packages/visuals | Wave state and visual parameters with platform-specific renderers |
| packages/audio | Playback contracts, timing, routing abstractions and recording manifests |
| packages/providers | Music, media, email, notification and optional distribution adapters |
| docs | Plans, ADRs, runbooks, credential requirements and evidence |

The browser player and native player share state contracts, not an assumption that one audio API works identically on both platforms. Use OpenAPI or an equivalent versioned schema and runtime validation at trust boundaries. Add ADRs for platform choice, job queue, identity, audio leader, provider, release policy and encryption boundaries.

## Hosting on the supplied resources

Deploy the web/API and worker on the user's designated Render project and Neon database resources. Render supports WebSockets and background workers [S9]. Start with one realtime API instance and a durable Postgres outbox; process jobs in the worker using short leases and row-level claiming. At larger scale add verified fanout coordination or an approved managed realtime service. Do not assume multiple API instances share memory.

Use pooled Neon connections for ordinary short transactions; use a separately limited direct connection only if a selected job or event mechanism actually needs session semantics. Do not depend on LISTEN/NOTIFY across a transaction pool. Poll a durable event log in bounded batches as the initial recoverable mechanism, measure its effect, and add dedicated connections or a broker only when justified. Never create one database connection per audience phone.

Store media and recordings in project-specific durable object storage with appropriate delivery/CDN support. Render's default filesystem is ephemeral [S10], so local server files cannot be the authoritative release library. Neon holds metadata, not audio blobs. Reuse only explicitly authorized resources for this project; object storage and email are additional dependencies beyond the three links the user intends to supply.

Separate development, staging and production identities and data. Neon branches support separate environments [S11], but a branch containing copied production data is not automatically privacy-safe. Use synthetic data in PR previews. Region placement, available plans, backups, uptime and costs must be checked against the actual accounts before deployment.

## Canonical entities

| Entity group | Important records and constraints |
| --- | --- |
| Identity | users, guest_sessions, profiles, artist_memberships, consent_versions; scoped roles and recoverable account links |
| Artist catalog | artists, albums, source_tracks, core_prompt_versions, media_assets and rights_metadata |
| Event control | events, playback_leases, track_instances, queue_items, rounds and round_transition_log |
| Game | sound_waves, wave_revisions, allocations, participant_budget_revisions and moderation_actions |
| Generation | prompt_snapshots, selected_waves, generation_jobs, provider_attempts and cost_reservations |
| Releases | releases, release_assets, release_credits, publication_events and takedowns |
| Listening | listening_sessions, playback_intervals, qualified_plays, reactions, comments and reports |
| Engagement | artist_follows, notification_preferences, delivery_attempts, leaderboard_ledger and aggregates |
| Recording | recordings, chunks, recording_manifests, consent_links and publish_requests |
| Operations | outbox, event_log, idempotency_keys, audit_log and deployment_records |

Every artist-owned record carries artist_id; event and round records also carry the parent IDs with foreign keys that enforce belonging. Use tenant-aware unique indexes. The generation key is unique on event, round and generation purpose. Reactions are unique per participant and release. Notification deduplication is unique per user, release and channel.

Amounts use integer smallest currency units and explicit currency; durations use milliseconds; audio positions use a defined unit and clock domain; timestamps use UTC. Do not store derived counts without a reproducible ledger or reconciliation path. Use database constraints for local invariants and transactional services for cross-row budget rules.

## Main command and event contracts

| Contract | Required fields or behavior |
| --- | --- |
| Join event | event slug/code, guest or account identity, consent version; returns scoped session and current snapshot |
| Set allocations | round_id, expected_revision, command_id, complete wave-to-points map |
| Submit Sound Wave | phrase, round_id, command_id, expected_revision, replacement allocation if necessary |
| Playback command | event_id, leader_epoch, sequence, queue_revision, command_id and requested action |
| Freeze round | leader epoch, boundary identity, expected state; yields immutable snapshot ID |
| Generation provider | capabilities, submit, lookup when supported, fetch, optional cancel and classified error |
| Publish release | validated asset IDs, publication revision and release timestamp |
| Progress report | listen session, event sequence, elapsed intervals and media position; bounded and deduplicated |
| Realtime event | schema version, event/round IDs, sequence, type, server timestamp and minimal payload |

Realtime initially uses authenticated WSS plus HTTPS commands. An event log supports replay from last sequence; if replay is no longer available, return a full snapshot. Reconnecting clients reconcile pending optimistic actions and show rejected votes. Anonymous screen clients receive only public data and no private prompts, credentials or unredacted profiles.

The database transaction is the success boundary for a vote acknowledgment. Broadcast follows commit through the outbox. A process crash after commit may delay a broadcast but cannot lose the accepted vote. Event delivery is at least once; all consumers deduplicate by event ID. Ordered command sequences prevent two control devices from reshuffling the queue based on stale state.

## Listening and feedback semantics

Separate playback starts, unique listeners, qualified plays, completion and downloads. Initially define a qualified play as at least the smaller of 30 seconds or half the track duration in actual accumulated listening. Replaying or seeking does not manufacture unique listeners. Count completion using deduplicated listened intervals rather than just the highest playhead position; client evidence remains a telemetry estimate, not proof of human attention.

Show the feedback prompt after completion or an in-app navigation away when unique listened coverage is more than half. If the OS kills a page, it cannot reliably show a final dialog; persist eligibility and offer a nonblocking prompt on return. Prompt once per release unless the user chooses to respond later. Never block navigation or require a rating to download.

Each participant has one mutable reaction: like, dislike or none. Comments have report, delete-own and moderation controls. Keep negative reactions private to the artist by default while showing public positive activity. Artist discovery combines enough unique listeners with a smoothed reaction estimate; always expose raw counts and sample size. Do not let private cue playback inflate audience statistics.

## Notification semantics

Persist a release first; then fan out foreground events, opt-in push and verified-address email. Email preferences apply even when native push is enabled. “Instant” means dispatch promptly after publication, not guaranteed delivery at an exact second. Track retries, bounces, unsubscribe, expired push tokens and duplicate suppression.

iOS web push requires a supported Home Screen web app and a user permission gesture [S13]. Ordinary QR-opened browser participation still works through foreground updates and optional email. Native apps use platform notification services and deep links; background delivery cannot be treated as an exact clock. Do not require push consent to join.

