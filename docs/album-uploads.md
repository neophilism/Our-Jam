# Private album ingestion

The performer Upload album audio panel accepts MP3 or WAV for an existing unplayed source. It does not seed songs or call a generation provider. It fully decodes a 15-second to ten-minute mono/stereo song, strips metadata, creates a 192 kbps MP3 playback derivative, validates duration/silence, verifies private object storage and updates only the source audio URL and measured duration. Title and core prompt are preserved. The original input is NOT retained remotely; keep the master. Inputs are limited to 128 MiB and one concurrent upload per API process. Hardware may impose lower practical time/memory limits; rehearse actual files.

Storage is the same private S3-compatible MediaStore used by generated releases; Neon Object Storage can provide it. Without a configured store, upload is rejected before body parsing and file selection is disabled. No bucket or credentials are provisioned by source code. Free allocation is not permission to incur overages.

POST /api/operator/sources/:id/upload accepts application/octet-stream with X-Command-Id and X-Event-Revision. It requires the owning artist's HttpOnly session and exact Origin before reading audio. Checks include ownership, revision, source immutability, digest-bound replay and full decoding. All mutable conditions are rechecked before publication. The event is locked while writing and attaching the verified object, preventing a concurrent round start from observing a replacement midway. Failed validation leaves the catalog unchanged. The app never follows URLs embedded in uploaded files.

The catalog stores a stable authenticated /api/operator/sources/:id/audio/:sha route. Delivery checks owning artist and the currently active SHA, then issues a short-lived storage URL. Expiring signed URLs are never stored as permanent source identities. Guests cannot retrieve unpublished album audio. Replaced files remain private for explicit cleanup; storage-success/database-failure may leave a content-addressed private orphan. Retry uses the same key. Cleanup must compare active source routes before deletion.

No schema migration: audio_url stores the stable route and duration_seconds stores rounded-up measured duration, honoring the existing 15-second minimum. Responses retain precise duration and SHA. Rollback must preserve the delivery route or replace/export links; otherwise uploaded album playback breaks.

Automated tests use isolated WAV fixtures and private in-memory storage, never seeded production content. Required live acceptance includes actual Neon bucket upload/download, private delivery on the deployed origin, and artist-file playback. Passing CI alone is not that evidence.

## Signed private delivery diagnostic

When `MEDIA_PROBE_ON_START=1` on the **isolated** hosted rehearsal service, the startup probe tests a random, non-user diagnostic object through authenticated S3 PUT/HEAD/GET, the actual SDK-generated short-lived signed HTTPS GET used by the private performer redirect, anonymous GET denial, and DELETE. This checks the storage transport/credential/presigning path without an operator credential or personal song. It does **not** establish actual owned-artist cookie/session authorization or uploaded MP3 playback; the performer must test those with their own recording and physical device before declaring the show ready.
