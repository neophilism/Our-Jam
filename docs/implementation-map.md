# Implementation-to-roadmap map

The approved 54-slice plan is unchanged. Actual GitHub PRs can implement a coherent vertical slice touching multiple planned concerns; this table prevents counting those concerns as completed merely because code exists.

| Actual PR | Planned scope touched | Evidence and remaining scope |
| --- | --- | --- |
| #1 | P001 | Repository, plan, ADRs, resource identities, CI and Engine Room manifest. Discovery ingestion not verified. |
| Core API PR | P003, P004, P005, P006, P008–P011, P015–P018, P020 | Initial schema, guest/operator sessions, events, atomic voting, SSE, boundary snapshots, artist-supplied asset release, listening/reactions/comments, next-track queue. Full original acceptance remains open, especially identity recovery, playback authority, automated generation, storage, notifications, hardware, and event load/recovery. |

P002 provider/hardware feasibility remains blocked on supplied assets/account/model. That does not prevent independently tested core implementation. No deployed app is called show-ready without G0–G4. No native app is claimed before P032–P036.
