# Playback timing and music generation

## Resolve the release boundary

The final votes cannot affect a complete track that is already downloadable at that same instant. Keep the participation window open through the source track, submit at its boundary, and release that round's result after generation and validation. To preserve a collective reveal, default to releasing ready results at the next album boundary. If a job is late, it misses that boundary and remains visibly generating; it does not delay album playback.

| Moment | Stage | Audience round | Generation and release |
| --- | --- | --- | --- |
| Start A | Album track A begins | A opens | No result exists yet |
| A ends and B starts | Continuous local playback | A freezes and B opens | Submit A; release any older ready results |
| During B | Album B continues | B remains editable | A generates and is validated |
| B ends and C starts | Continuous local playback | B freezes and C opens | Submit B; release A if it is ready |
| Later boundary | Album or inserted performance continues | Current eligible round follows policy | Release late ready results without concealing their delay |
| End of set | Closing performance or announcement | No new round unless artist opens one | Drain remaining jobs and release as ready; do not wait for a nonexistent next track |

An artist can select “release as soon as ready” instead. All eligible listeners see the same publication state and release timestamp, but network and notification delivery are not physically simultaneous. Do not synchronize mandatory phone playback; require the listener's tap. A future optional listening-party feature would have its own clock and buffering contract.

## Authoritative playback

Use one paired show laptop as the media playback leader. It schedules locally cached, decoded tracks against the audio clock, including gapless transitions for V1. The backend remains the authority for round state, allocations and publication. Other consoles send commands; they do not independently advance the show.

At each scheduled segment, publish a playback epoch, track instance ID, media position, planned boundary, monotonic anchor and server-time mapping. Server heartbeats check leader health. A generation-triggering close requires a valid leader epoch and a known boundary, then serializes against votes. Exactly one close command wins. Duplicate ended callbacks, reconnects or worker retries cannot open duplicate rounds.

If the leader becomes stale, the server suspends automatic generation and marks the round's state uncertain rather than pretending to know what is playing. Local album playback continues. Reconnection reconciles the locally recorded sequence with server state before the operator explicitly resolves uncertain rounds; do not backdate new votes or silently submit ambiguous snapshots. Test the achievable boundary skew and disclose it.

Pause freezes the participation countdown and moves the planned deadline on resume. Seeking does not reopen closed rounds. A replay gets a new track-instance and round identity. A skip before the minimum participation window ends cancels that round without a generation charge; otherwise the artist can close once. Warn about very short album tracks during setup and allow an explicit preconfigured shared round or nonparticipating interlude.

Inserted crowd tracks default to performance-only segments, with no recursive generation. They can carry a ready-release boundary and do not skip the next original album track. The queue distinguishes source album tracks, crowd performances, interludes and live microphone segments. V2 defines more flexible DJ boundaries separately.

## Generation state machine

Round states are PLANNED, OPEN, PAUSED, FROZEN, CANCELLED and COMPLETE. Generation states are QUEUED, SUBMITTING, GENERATING, UNKNOWN, VALIDATING, READY, RELEASED, FAILED, HELD and CANCELLED. A frozen snapshot never changes in response to later UI events.

In a transaction, close the round, save the prompt snapshot, reserve the maximum allowed cost and create an outbox record with a unique round-generation key. A worker dispatches afterward. Use provider idempotency keys where supported. If a submission times out after it may have been accepted, record UNKNOWN and reconcile using the provider request ID or job lookup. Without a safe lookup or idempotency mechanism, require an explicit operator retry; never blindly create a second paid song.

After download, verify media type, decode, duration, nonempty audible content, peak level and file integrity. Retain an immutable original and create a normalized listening version if needed. Do not pretend format checks prove artistic quality or copyright clearance. Use a rights-approved instrumental release policy, moderation controls and an artist hold option.

Upload to durable object storage, verify checksum and delivery permissions, and only then atomically mark a release available. Publish a durable release event and separate notification jobs. An interrupted upload or unprocessed file must not produce a working-looking download link. Preserve content hashes, source round, provider/model, cost and provenance in the release record.

## Core prompt and audience composition

Each source track stores an artist-authored core prompt, allowed variation categories, tempo/key constraints if desired, duration target, instrumental preference, negative constraints and optional authorized reference assets. Describe the album's sound in musical terms. Text similarity is not a guarantee of melodic or timbral continuity; evaluate actual results against the album before launch.

Prompt packaging is deterministic. Calculate the selected provider's actual payload constraints, including delimiters and required instructions. Reserve the core, then include whole ranked wave phrases, with explicit decisions on conflicts. Start with a configurable maximum of six to eight waves; use the actual model's quality evaluation to adjust. Do not assume every provider uses the same character or token limit. Store compiler versions and payloads so results are explainable.

Text-only generation is the initial route. Add reference-audio conditioning only when the provider supports it, the artist holds the necessary rights and tests show improved continuity. Stems, uploaded album masters and voice imitation are separate capabilities, not implicit consequences of a text prompt. Do not forward audience names, email addresses or recordings to a generator.

## Provider recommendation and evidence gate

Use a provider adapter and evaluate **Stable Audio as the first instrumental candidate**. Its own current licensing guidance allows standalone tracks and app-related use subject to applicable terms [S1]. Its model family and research are promising, but model benchmark speed is not a hosted-service latency guarantee [S2]. Confirm the actual hosted endpoint, account entitlement, limits, hosting terms, musical quality and download rights before choosing it. Self-hosting adds compute and operational work and is not the default for the first event.

ElevenLabs is a technically capable alternative: its composition API offers prompt-based generation, duration control and instrumental output [S3]. However, its current published terms restrict music libraries without written permission and restrict making Music API access available to third parties without authorization [S4, S5]. This application's downloadable catalog and audience-generated input make written confirmation of the exact use case prudent before integration. Review the applicable effective terms for the actual account; a generic commercial-use claim does not settle this question.

Do not use unofficial wrappers around a consumer music website. A later alternative provider must pass the same rights, quality, prompt, budget and reliability gates. Automatic provider switching is disabled unless the replacement has been preapproved and benchmarked; otherwise it could change both licensing and the album's sound.

## Benchmark before promising a show

Use artist-supplied core prompts and realistic winning wave sets. Test short and full intended generation durations, sparse and dense prompts, contradictory input, concurrent jobs, network interruption and provider rate limiting. Record request acceptance, first audio byte when relevant, complete file, validation and publish times separately. Run a small qualification batch first; expand to a 20-job rehearsal sample only within approved credits. Small-sample percentiles are preliminary.

Let G be end-to-end generation plus validation time, I the interval between eligible boundaries, and C the approved generation concurrency. Queue stability requires average workload to fit capacity; a rough planning condition is G divided by I below C, with headroom. The next-boundary experience needs the observed high-percentile G plus a release buffer to fit the following track, which can be shorter than the average. A short advertised model inference time does not include queueing or transfer.

If latency is poor, shorten generated instrumental duration, use a longer release delay, or make fewer rounds eligible before the show. Never shorten the audience's window merely to hit an artificial reveal deadline. A provider outage leaves voting history visible and shows an honest delayed or failed result.

## Downloads and distribution

Publish a broadly playable compressed audio file immediately after validation and keep the source-quality original if supplied. Add track metadata, artist, event and contributor acknowledgments; do not relabel an MP3 as a lossless master. An event ZIP, artwork and credits manifest can follow asynchronously. Download access remains free without marketing enrollment.

Too Lost's official guidance describes quality control and store ingestion and recommends a release date two to four weeks ahead [S6]. Treat Apple Music, Spotify and other DSP delivery as a later curated distribution workflow, not an event-time dependency. Build an export with audio, artwork, metadata, contributor clearances and AI-disclosure fields; add distributor APIs only after their actual availability and policy are confirmed.

