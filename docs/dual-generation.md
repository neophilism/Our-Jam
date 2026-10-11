# Dual music providers and zero-budget rehearsal

The performer console offers Mureka / Stable Audio buttons in Music generation. Selection changes event.settings.generationProvider using the same owning-artist session, exact-Origin middleware, event lock, revision fence, command replay and audit trail as other show settings. Existing round creation copies the full settings object, so active and closed rounds retain the chosen provider. No schema migration is required. Queued jobs use their round's setting, never the artist's later toggle. No automatic cross-provider fallback is permitted.

The current adapters are Stable Audio 2.5 and Mureka 9.5 instrumental text generation. The original song is played by the show; generation uses the saved private core prompt plus final selected Sound Waves. This is not waveform remix/reference generation. Mureka's instrumental endpoint accepts at most 1,024 prompt characters and does not accept a target duration. Longer compiled prompts block before dispatch without truncation. Mureka requests n=1 explicitly, saves its task ID before polling, fetches only approved HTTPS media hosts without credentials/redirects, bounds JSON/audio responses and validates decoded audio. A known task can be polled through the adapter's resumeRef path without POSTing again; the operator reconciliation UI remains separate work. Failed/unknown jobs are never automatically resubmitted.

## $0 means no chargeable request

Set GENERATION_ENABLED=1 and RUN_INLINE_GENERATION=1 to run the real job processor, with GENERATION_EVENT_BUDGET_CENTS=0 and GENERATION_TOTAL_BUDGET_CENTS=0. The worker records approved_budget_zero before reserving cost, incrementing attempts, contacting a provider or writing generated media. This is a real policy rejection, not a simulated provider error. Tags, five-point votes, public display, playback and frozen snapshots are independent of generation funding. There is no automatic Thursday activation: explicit new spending authorization is required.

STABLE_AUDIO_KEY is supported directly; STABILITY_API_KEY remains a backwards-compatible alias. MUREKA_API_KEY selects Mureka credentials. GitHub Actions secrets do not automatically become Render runtime environment variables. Use a reviewed deployment bridge or configure the runtime secrets directly; never put keys into client code, logs, URLs or a repository variable.

Positive spending also requires the existing rights acknowledgement and private storage. Stable Audio's price fields are STABLE_AUDIO_MAX_JOB_CENTS and STABLE_AUDIO_PRICE_VERIFIED_UNTIL (existing GENERATION_MAX_JOB_CENTS / GENERATION_PRICE_VERIFIED_UNTIL are accepted for that provider). Mureka requires its own MUREKA_MAX_JOB_CENTS and MUREKA_PRICE_VERIFIED_UNTIL. Never reuse one provider's rate for the other. Price expiry, missing key, missing storage, exhausted approved budget, HTTP 402, and uncertain acceptance remain distinct states. HTTP 402 is exercised with test fixtures only until an authorized live test.

## Storage and device release

Neon Object Storage is S3-compatible and available on the existing isolated Our Jam branch. Use private buckets and keep object identities in Postgres, rather than storing audio blobs in relational rows. Runtime S3 credentials and verified file ingestion remain deployment prerequisites. No bucket or paid service is implied by this code change.

Apple Developer membership is needed for TestFlight distribution, not a simulator build. The existing native draft still has its separately tracked dependency/security and distribution gates. This increment does not represent a signed native binary, a running emulator, hardware rehearsal or successful real provider generation.

## Verification and rollback

Tests must cover frozen selection, replay, owning artist isolation, $0 no-call/no-reservation behavior, Mureka n=1/poll/task persistence/media-host validation, and credit rejection without retry. Existing API/media/browser/build/audit/Docker gates remain required. Keep paid dispatch disabled while rolling out. Old worker code ignores the provider selection and must never process Mureka-selected jobs; drain/stop workers before rollback. No deletion of saved rounds or jobs is needed.

Official contracts checked October 11, 2026:
- https://platform.mureka.ai/docs/api/operations/post-v1-instrumental-generate.html
- https://platform.mureka.ai/docs/api/operations/get-v1-instrumental-query-%7Btask_id%7D.html
- https://platform.stability.ai/docs/api-reference
- https://neon.com/blog/building-neon-object-storage
- https://docs.expo.dev/build-reference/simulators/
