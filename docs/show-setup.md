# Preparing and changing a show

Open the performer console after creating an album session. The remaining queue offers **Next**, **Up** and **Down** controls. These move queued album tracks or crowd releases without replacing the currently playing item. Every reorder contains the full remaining queue and the event revision: a concurrent change is rejected, and the performer refreshes before trying again. Repeated command IDs replay the original result. This is album-release queue management; it does not implement DJ V2 deck mixing.

**Show setup & audio check** lets the owner change the title, artist display name, artist-selected music providers, display density, minimum participation period, maximum prompt waves, and event generation cap. Display/link changes appear immediately. Generation rules are copied when a round opens, so changing settings does not alter an audience's already-active round. A generation cap counts all frozen jobs, including blocked jobs, as it did before this UI.

The private album editor returns core prompts only to the owning operator. A source can be edited until its first round starts. It then remains immutable, including its linked audio URL and duration. The event lock serializes source edits with playback advancement. The editor captures a revision with the fields it loaded and preserves drafts across live updates; stale saves require an explicit field reload. Saving one track closes the loaded fields, and Reload album fields fetches the current revision before the next edit.

The audio check loads metadata for at most three linked files concurrently, stops after ten seconds per file, and cancels on navigation or changes to the show revision. A duration difference over two seconds is flagged. No playback or microphone permission is requested. A successful metadata result does **not** validate an entire file, guarantee offline access, or confirm a speaker/headphone path. Files without URLs are labeled for an external player. Use the real device and network for rehearsal, and keep the separately documented local album fallback.

## Contracts and evidence

- `PUT /api/operator/events/:id/queue`: complete ordered `queueIds`, UUID `commandId`, `expectedRevision`.
- `PATCH /api/operator/events/:id/settings`: complete editable settings, UUID command and revision. `purchaseLinks` and the per-show routing choice control where fans find the album. Legacy `purchaseUrl: null` still clears an old single link.
- `GET /api/operator/events/:id/sources`: owner-only fields with a matching event revision and `played` flags.
- `PATCH /api/operator/sources/:id`: complete source fields, UUID command and revision. Omitting `audioUrl` preserves the existing recording, including a private uploaded file. Explicit `audioUrl: null` clears a legacy link. The performer UI edits titles and musical descriptions without displaying a misleading external-hosting URL field.

No migration or new resource is required. Existing read/API contracts remain compatible. Removing the UI rolls back the feature without rewriting previously frozen rounds.

`tests/show-setup.test.ts` covers replay, conflicting revisions, queue permutation validation, owner isolation, same-origin writes, unplayed source changes, and immutable active-round settings. `tests/browser/setup.spec.ts` exercises desktop/mobile console editing, concurrent draft preservation and metadata preflight with a known PCM fixture. Physical audio and live-show acceptance remain separate gates.

Copy and tutorial language should follow [OurJam copy and onboarding standard](copy-and-voting-language.md); metadata editing does not replace uploaded audio.
