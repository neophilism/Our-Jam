# Artist pages and listener return paths

`/artist/:id` is the artist's public home: a name, biography, up to six HTTPS music/storefront links, live/upcoming/archived session filters, original album links and the existing artist leaderboard. The signed-in performer edits the profile from `/performer`. Saved revisions and replayable command IDs prevent silent overwrites. Profile edits do not rename individual events or change their prompts.

Session cards lead to `/event/:code?listen=1`, opening the free-track collection first. Existing `?track=:releaseId` links open a specific published track. Playback still requires the listener's gesture. Archived event URLs and both QR destinations remain ordinary persistent routes. Purchase links go to the artist's existing store; clicks are not recorded as sales and no checkout is hosted here.

Each event now declares open remote voting or room-code admission. New rooms created through the performer form default to room-code voting. Listener-first navigation is a preference; a shared code is not proof of physical attendance. See `docs/audience-admission.md` for capacity, code rotation and legacy compatibility. Native-store commerce review and physical-device acceptance remain open.

`/library` lists the authenticated guest's positive reactions across artists and events. It reuses the existing reaction records rather than inventing a second collection. Hidden or unpublished tracks are excluded; unlike removes an entry. Private stored assets use the existing mediated download endpoint. No artist core prompt or storage key is returned. The collection belongs to the 30-day browser/native guest identity; clearing that identity loses access until a separate recovery/account feature exists. Email confirmation does not restore this guest identity. Downloads remain the durable way to keep music.

Artist event lists and collections have bounded offset pagination and stable secondary ordering. The client deduplicates loaded IDs, but concurrent additions/removals can shift pages; refresh to see current ordering. This is not a snapshot export. Discovery and richer following/collections remain future increments.

## Reconnect behavior

The audience now disables voting on an offline event, failed snapshot fetch, stale state older than 15 seconds, or return to the foreground until refresh completes. Polling remains a fallback when streaming fails. Requests carry monotonically increasing local sequence numbers so a delayed earlier response cannot replace an already-applied later response. These are UX safeguards; the server's round, lease, membership and ballot checks remain authoritative. No offline votes are queued or replayed into later rounds.

## API and migration

- `GET /api/artists/:id?state=all|live|ended|waiting&offset=0&limit=20`: public profile and bounded session list.
- `GET/PATCH /api/operator/artist`: session-scoped profile and revision-fenced update.
- `GET /api/library?offset=0&limit=20`: guest-scoped positive reactions only.

Migration `005_artist_profiles.sql` adds profile fields/revision and lookup indexes. Apply it before deploying this server; readiness requires migrations 001–005. The versioned migration was applied successfully to isolated Neon branch `br-blue-unit-b5rk1hit` on October 11, 2026; production was unchanged. It is additive, so the prior application version can run against the migrated schema during rollback. This feature provisions no new service or spending.

API tests cover safe links, profile revision/replay, artist-scoped archive filters and pagination, participant isolation, and hidden/unpublished exclusion. Desktop/mobile browser scenarios cover the artist editor, listener-first archive navigation, liked-track removal and offline-to-online voting recovery. Physical iOS/Android, large-crowd load and guest-account recovery remain separate release gates.
