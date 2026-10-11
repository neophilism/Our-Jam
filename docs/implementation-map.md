# Implementation-to-roadmap map

The original 54-slice plan remains authoritative. Actual PRs deliver vertical slices touching several planned concerns, with remaining work explicitly tracked below.

| Actual PR | Implemented scope | Remaining scope |
| --- | --- | --- |
| #1 | Planning, repository, CI, platform/security ADRs, resource identities, Engine Room manifest | Verified ingestion and independent security review |
| #2 | PostgreSQL data model, guest/operator sessions, atomic voting, immutable prompt compilation, SSE, artist assets, reactions/comments/listening, play-next queue | Account recovery, multiple artist provisioning, notification delivery and high-load rehearsal |
| #3 | Responsive audience, stage display, QR links, profile, artist setup and console | Native clients, visual quality/performance testing on actual event hardware |
| #4 | Playback lease/fencing, pause/resume, durable cutoff, initial audio synchronization, chunked local recording and recovery | Gapless/offline queue playback, real mic routing, multitrack input, long-session rehearsal |
| #5 | Disabled-by-default paid generation, durable cost reservation, uncertainty quarantine, audio decode validation, private S3 adapter, container and Blueprint | Actual provider and bucket credentials/permissions, rights/budget approval, project-scoped deployment and production integration test |
| #6 | Release credits, all-time/week/month artist/event leaderboards, anonymity, delayed listening feedback, microphone-driven stage pulse | Notification push/email, configurable scoring periods/timezones, timing awards, verified beat response |
| Live control/review slice | Explicit device handoff, immediate takeover pause, reported comment and release moderation, non-restorable author deletion | Moderator staff roles, appeal/report workflow, automated abuse detection |

See `PROGRESS.md` for merged-head CI evidence. P002 provider/hardware feasibility remains blocked on real account/assets/model. Native P032–P036, DJ V2 and the secondary demonstration version are not completed by mobile browser coverage. No deployed app is called show-ready without G0–G4 from `09-first-show-readiness.md`.
