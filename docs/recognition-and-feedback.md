# Recognition, feedback and live visuals

Contributor credits derive from the immutable selected-wave snapshot for a published, unhidden release. The artist leaderboard provides all-time, calendar-week and calendar-month windows plus an event filter. The default is UTC with Monday-start weeks. Performers can select an artist time zone for calendar-week and calendar-month boundaries and independently hide public leaderboards. Included-wave counts and final points from others are separate metrics. Own points do not inflate support-from-others. Retried requests and repeated voting do not create extra credit. Failed, pending or hidden releases earn no public leaderboard entries.

Public names and music avatars come from current profiles, so switching to Anonymous updates historical public credits as well. Raw participant IDs and private core prompts are not included. Optional consented profile pictures are supported as bounded PNG thumbnails; timing awards remain separate later work. Recoverable accounts are covered by the existing account lifecycle, not by leaderboard scores.

The listener accumulates unique played intervals. When the server reports more than half heard, the browser remembers a pending feedback prompt. Leaving the listener through an in-app tab change shows a nonblocking reminder; rating or dismissing resolves it. A pending reminder can return after a reload. The saved data contains only release metadata and prompt state, not session credentials. Storage eviction and OS termination can prevent a final unsent listening update. Client listening remains an estimate, not proof of attention.

The public display has an explicit room-audio toggle. It analyses microphone bass-band energy locally and blends the pulse into independently moving 3D wave surfaces. It does not record or upload that input, and its beat response is not a broadcast clock for phones. Hardware permission and room pickup need venue testing. Labels and objects move between ranked positions, and layout follows screen aspect ratio and the configured visible-wave limit. A split visualization bundle lets the participation controls load before the heavier graphics code.


## Recognition settings and public pictures (OJ-023 / PR102)

Apply additive migration `024_recognition_settings.sql` before this application
revision. Readiness rejects a missing migration. Existing artists default to
visible UTC boards, and existing listeners keep their musical seeded avatars.
Rollback application code while retaining the additive columns and collected
profile data; no destructive down migration is authorized.

The authenticated performer console exposes `GET/PUT /api/operator/recognition-settings`
with the session's artist scope, a validated database-supported time zone, a
visibility switch and an expected revision. Week boundaries are Monday midnight
in that zone; month boundaries are local calendar starts, including DST. The
public board reports its zone and visibility explicitly. Hiding a board does
not erase separately published release credits. Aggregates are rebuilt from
immutable selected-wave snapshots on each read; later live votes do not create
additional release credit. Pending, failed, future-dated and hidden releases
are excluded. The internal clock parameter exists for deterministic boundary
tests and is not exposed by the HTTP route.

A listener may keep the musical avatar or explicitly consent to a public picture.
The browser crops a selected PNG/JPEG/WebP to a 128-pixel square. The server accepts
only a bounded 8-bit RGBA PNG, verifies chunk checksums/order/dimensions, bounds
inflation, reconstructs pixels and writes a new PNG containing no original
metadata. SVG, malformed images, large dimensions and compressed pixel bombs
are rejected. Processing and stored data are bounded to 128x128 and at most
128 KiB per profile; thumbnails use the existing project database, not a new
public storage service or credentials. No original file is retained.

`PUT/DELETE /api/profile/avatar` require the current guest session and Origin;
uploads additionally require `publicUseConsent: true`. Expected avatar revisions
prevent stale tabs overwriting or removing a newer picture. Clients never choose
another participant ID or provide an external image URL. `GET /api/avatars/{sha}`
returns only a currently public profile's normalized bytes with image/png,
no-store and nosniff headers. Anonymous profiles use a generic avatar and omit
the photo URL in live waves, leaderboards and release credits; their pictures
are no longer served anonymously. Deletion restores the seeded avatar. Previously
public images already saved by a viewer cannot be recalled.

Automated evidence covers own-session/consent/revision guards, anonymity and
removal, image metadata and malformed-pixel boundaries, hidden boards and UTC/DST
calendar boundaries. These are isolated tests; actual device photo selection,
production database migration and deployed acceptance remain unverified until
recorded against the released revision.
