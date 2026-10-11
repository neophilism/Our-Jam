# Implementation-to-roadmap map

The canonical `registry/roadmap.json` contains 54 approved work packages; `backlog.json` retains their detailed historical dependency specification. Actual PRs deliver vertical slices touching several planned concerns, with remaining work explicitly tracked below.

| Actual PR | Implemented scope | Remaining scope |
| --- | --- | --- |
| #1 | Planning, repository, CI, platform/security ADRs, resource identities, Engine Room manifest | Verified ingestion and independent security review |
| #2 | PostgreSQL data model, guest/operator sessions, atomic voting, immutable prompt compilation, SSE, artist assets, reactions/comments/listening, play-next queue | Account recovery, multiple artist provisioning, notification delivery and high-load rehearsal |
| #3 | Responsive audience, stage display, QR links, profile, artist setup and console | Native clients, visual quality/performance testing on actual event hardware |
| #4 | Playback lease/fencing, pause/resume, durable cutoff, initial audio synchronization, chunked local recording and recovery | Gapless/offline queue playback, real mic routing, multitrack input, long-session rehearsal |
| #5 | Disabled-by-default paid generation, durable cost reservation, uncertainty quarantine, audio decode validation, private S3 adapter, container and Blueprint | Actual provider and bucket credentials/permissions, rights/budget approval, project-scoped deployment and production integration test |
| #6 | Release credits, all-time/week/month artist/event leaderboards, anonymity, delayed listening feedback, microphone-driven stage pulse | Native/web push and live email acceptance, configurable scoring periods/timezones, timing awards, verified beat response |
| #7 | Explicit device handoff, immediate takeover pause, reported comment and release moderation, non-restorable author deletion | Moderator staff roles, appeal/report workflow, automated abuse detection |

| #8–#10 | Native guest API identity, schema replay/isolation and canonical tracking | Recoverable accounts, multi-artist provisioning and native distribution |
| #11 (unmerged draft) | Expo audience client; successful JS exports and native configuration generation | Upstream dependency audit gate, admission flow, signed builds and real devices |
| #12 | Private album editing, queue reordering and show audio metadata checks | Durable uploads, full media/hardware validation and gapless playback |
| #13 | Opt-in verified release email, encrypted contacts, durable outbox and signed suppression | Approved live sender/inbox rehearsal, native/web push and high-volume delivery |
| #14 | Artist profiles/archives, guest liked tracks and reconnect guards | Cross-device recovery, following and richer discovery |
| #15 | Checksummed local album backup, offline continuation in an open console and recording-input selection | Offline page reload, output routing, real microphones and long-session capture |
| #16 | Artist holds/private review, frozen publication policy and safe unsent cancellation | Real provider/storage completion, reconciliation and physical cue isolation |
| #17 | Room-code voting, remote listening and transactional contributor capacity | Stronger identity, native admission and venue-scale load testing |
| #18 | Remembered still/light rendering, reduced-motion/data-saving path and WebGL fallback | Sustained hardware performance, deeper visual design and accessibility rehearsal |

| #19 | Shared-network budgets, bounded snapshot work, slow-stream recovery and deployment preparation | Render workspace capacity, approved production migration and deployed load testing |
| Recoverable profile increment | Private recovery keys, web/native session restoration, artist follows and personal release feed | Verified accounts, artist roles, native recovery UI and privacy export/anonymization |

See `PROGRESS.md` for merged-head CI evidence. P002 provider/hardware feasibility remains blocked on real account/assets/model. Native P032–P036, DJ V2 and the secondary demonstration version are not completed by mobile browser coverage. No deployed app is called show-ready without G0–G4 from `09-first-show-readiness.md`.
