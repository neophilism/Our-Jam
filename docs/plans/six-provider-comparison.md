# Six-provider music comparison lab — implementation plan

Status: **approved scope, implementation in progress** (16 October 2026).
Repository: `neophilism/Our-Jam`. Canonical work registry: `registry/prs.json` (OJ-055 through OJ-066). This supplements, and does not erase or renumber, the 54 existing work packages.

## User outcome
The **platform administrator** signs into `/admin`, selects **any non-empty subset** of six music-generation engines, supplies a single instrumental prompt/target duration and starts one deliberate side-by-side comparison. All selected engines receive a frozen, versioned semantic prompt; each produces its own result or a truthful failure. Administrator can listen individually or blind/randomized A/B, compare elapsed time and true costs, choose a favorite and export evidence. Preserve the performer-side two-choice show flow until explicitly migrated; no accidental change to audience, voting, publishing, event limits or paid generation.

## Six engines: exact identity and license gates
| Provider ID | Engine | Mode | Use permission / gate |
| --- | --- | --- | --- |
| `mureka` | Mureka instrumental | Hosted paid API | Subscription/API key, price verification, entitled use |
| `stability` | Existing Stable Audio 2.5 | Hosted paid API | Existing key, price verification, entitled use |
| `ace_step` | ACE-Step 1.5 | Self-hosted GPU service | MIT code and published model licensing review |
| `heartmula` | HeartMuLa | Self-hosted GPU service | Apache 2.0; validate exact checkpoint and source |
| `stable_audio_open` | Stable Audio 3.0 Medium open weights | Self-hosted GPU service | Stability AI Community License; registration/eligibility, gated model access, revenue limits and other model conditions |
| `musicgen` | Meta MusicGen released weights | Self-hosted GPU service | **Noncommercial research/evaluation only** under CC BY-NC weights. **Never publish, sell, distribute or deploy commercially** absent a separate rights grant. Do not mislabel as unrestricted. |

Sources (verify exact checkpoint and license before deployment):
- https://github.com/ace-step/ACE-Step-1.5 (MIT); upstream API https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md
- https://github.com/HeartMuLa/heartlib (Apache 2.0)
- https://stability.ai/explainers/self-hosted-vs-api-generative-audio-choosing-a-deployment-model and https://kb.stability.ai/knowledge-base/stable-audio-commerical-and-usage-licensing
- https://huggingface.co/stabilityai/stable-audio-3-medium (license agreement and gated weights)
- https://huggingface.co/facebook/musicgen-small (CC BY-NC 4.0 model weights; MIT code **not** equivalent to commercial-weight rights)

An "open model" is not a zero-cost model: GPU compute, warmup, retained idle uptime, storage, network, and engineering still cost money. Never silently switch the existing Stable Audio *API* to a different self-hosted model. MusicGen experimental tracks must stay private and carry an explicit noncommercial label; users cannot publish or download them as commercial releases.

## Invariants and admin UX
1. **One prompt snapshot, N independent immutable attempts**. Persist original text, canonical semantic prompt and SHA-256, user-requested instrumental flag, duration, seed if supported, chosen engines and order, model/checkpoint versions, adaptations and provider-specific deviations (for example Mureka variable duration and prompt limit). Mark unsupported options explicitly, not silently.
2. Admin selection is a checkbox group with Select all six / Clear / Select all commercially eligible, readiness indicators (configured vs licensed vs supported vs running) and persistent per-admin selection. Never treat "installed code" as "GPU available".
3. Preflight shows estimated exposure per engine, total estimated exposure, unavailable/configuration warnings and licenses, with **separate actual incurred amounts**. Admin explicitly starts each test; saving checkboxes must never dispatch.
4. Each provider sub-job has lifecycle `queued/running/succeeded/failed/unknown/blocked/cancelled`; never retry ambiguous billed or accepted remote requests by default. Durable receipts, unique attempt id, leases, capped concurrency, bounded waits and restart reconciliation. A failed/blocked provider does not hide successful sibling tracks.
5. Store private, hash-verified generated audio with provenance. No public exposure, automatic distribution or fan-visible release from admin tests. Signed delivery and admin-only access. Never forward credentials to a URL supplied by a client.
6. **Ear-based comparison**: six independently playable, same gain-normalized *playback* tracks, immediate switch while keeping position where possible, blind/random order and reveal button, 1–5 subjective quality + prompt adherence + favorite, notes, provider metadata and duration. Keep unmodified masters archived; loudness normalization should affect playback previews only.
7. **Actual cost accounting** per attempt: API list/quoted price estimate, supplier invoiced charge when available and manual invoice reconciliation; for self-host GPU, machine/rental ID, GPU model, currency, actual rate and runtime/allocated time, cold start, model load, queue idle allocation, retry waste, storage bytes/duration/cost, data egress and any platform overhead. Treat any missing item as `unavailable`/estimated, **never zero**. Separate gross session cost from allocated marginal attempt cost; distribute shared uptime fairly using a documented reproducible policy. Round to integer micro-USD internally, render cents/decimals, show comparison cost per successful track and per artist-approved usable track.
8. Commercial safety: MusicGen research license, stable-audio gated rights, lack of platform approval and missing credentials all block live use. A research-only private evaluation is separately confirmed before MusicGen execution.
9. Existing show generators and spending guards remain intact until covered by explicit compatibility tests and owner's independent budget/configuration. Do not reimpose a $0 hardcoded constraint on the **new admin comparison**; instead require explicit admin initiation, server-defined rate/budget safety, priced preflight and documented usage.
10. Security: separate ADMIN_TOKEN session, CSRF same-origin, RBAC private audio, no inline credentials or untrusted URL fetch, model inference workers isolated from public web service, scoped secret injection, size/type/time caps, allowed authenticated HTTPS inference origins, egress controls, and prompt/output privacy. AI-assisted review/testing is a development gate, not an outside-human signoff blocker.

## Cost methods and data model
- `comparison_batches`: batch ID, immutable normalized prompt hash and full prompt (admin-only), duration, instrumental, seed/settings, owner/admin, selected-provider snapshot, approved ceiling, timestamps/state.
- `comparison_runs`: one per (batch, provider), idempotent state, provider+checkpoint, attempt receipt, request duration/actual generated duration, start/finish/warmup/queue times, media key+SHA, failure reason, cost provenance, explicit licensing state, evaluation notes.
- `inference_rate_cards`: dated, admin-managed prices in micro-USD and rate units (GPU-second, API generation, storage GiB-month, egress GiB), supplier, GPU SKU, effectiveFrom, source/last verification, markup=0 unless documented. Preserve rate snapshot with each job.
- `inference_usage_events`: append-only metering records from trusted workers/provider invoices: job, source, GPU/node/session, billed seconds, load seconds, idle shared seconds, bytes, quantity, unit rate, estimated/actual/reconciled and provider invoice reference. Reject duplicates, negative quantities, invented charges. Admin may correct via compensating event with reason; no destructive rewrite.
- `comparison_reviews`: admin-only rating/favorite decisions. Full totals by batch and provider over chosen time period, CSV export with estimate vs actual, success counts, total spend and cost per usable output. No false precision for estimates.

GPU billing accounting: record start/stop from host metering when provided; when host invoice is not accessible label **estimated**. Allocate shared container startup/idle to jobs based on reserved GPU-seconds over the billing interval (or report unallocated overhead visibly). GPU rentals may charge while idle or loading models. Distinguish economic marginal cost from fully loaded cost; a single GPU hosting multiple simultaneous model jobs must not be double-billed.

## PR sequence (register OJ-055–OJ-066)
**OJ-055 — Canonical catalog + license/readiness policy + plan**. New six-provider catalog and explicit commercial/research-only state; preserve two existing production adapters. Tests protect against accidental MusicGen publication. Document required env and exact rights caveats. Update registry/plan checker without modifying original 54 records.

**OJ-056 — Admin provider selection and rate-card editing**. New panel under existing `/admin`, multiselect, select all, persisted owner selection, manual GPU hourly rate and source/effective date; credential/readiness from server, no secret disclosure. POST only changes settings, never starts inference.

**OJ-057 — Additive comparison schema and private APIs**. Migration 010+ based on latest main; immutable batch+run rows with snapshot and a durable audit trail. Admin-only create/list/detail, pagination, idempotency and explicit per-batch spending approval. `/api/ready` migration contract and migration tests update.

**OJ-058 — Fan-out dispatcher and isolated durable worker**. Batch creates exactly N run records and separate leases/retries with unknown-state protection, stop/cancel APIs, per-run budget reservation, aggregate state, no dependency on a show round. Max parallelism configurable; default serial for shared GPU.

**OJ-059 — ACE-Step 1.5 runner**. Pinned checkpoint; deploy authenticated upstream REST `release_task/query_result/v1/audio`, duration/instrumental adapters, verify body and size, persist task ID and failures. End-to-end synthetic and approved real-GPU smoke.

**OJ-060 — HeartMuLa runner**. Pinned official checkpoint, Python inference entrypoint and authenticated gateway contract, output conversion to valid MP3 via FFmpeg, prompt and instrumental adaptation; tests and profiling on allocated GPU.

**OJ-061 — Stable Audio 3 Medium self-host runner**. Separately installed licensed/gated model weights; strict own-host inference service, duration adaptation, fingerprinted provenance, rights acknowledgment, failure tests.

**OJ-062 — MusicGen research-only runner**. Isolated Python model runtime; enforce noncommercial/private flag at submit, storage, signing and export/release boundaries; never select by default for commercial runs. Research evaluation only unless separate license provided.

**OJ-063 — GPU scheduling and tenant isolation**. Secure HTTPS worker registration, configured server-origin allowlist, health/readiness VRAM/queue, pull-based jobs, provisioning/runbook for rented GPU and auto-stop, no external spend on an unavailable worker.

**OJ-064 — Verifiable cost ledger and cost reconciliation**. Capture API estimate and invoice, GPU wall/billed/warmup/idle seconds, storage, transfer; fee source and certainty flag; admin rate edits and CSV, daily/provider rollups; break-even reporting.

**OJ-065 — Six-way audio audition + scoring UX**. Track player, A/B blind comparison, consistent playback gain, reveal/re-randomize, rating + preferred track, duration and quality comparisons, partial failures; no public release.

**OJ-066 — Matrix tests, rollout and operator handbook**. Contract tests for all six mock services, SQL migrations/rollback, authentication/CSRF/SSRF, retries, unknown receipts, mixed failures, variable length, no-commercial-MusicGen, spend and invoice math, accessibility, end-to-end UI and staging deployment; then permitted real runs and recorded quality/cost evidence. Preserve existing paid show tests. PRs merge with passing checks; never claim GPU/test succeeded without evidence.

## Operational prerequisites (not a development blocker for other PRs)
- Existing MUREKA_API_KEY and STABLE_AUDIO_KEY in Render; **verify**, do not display.
- Project-specific ADMIN_TOKEN set in Render and safe storage credentials (existing rehearsal settings do not prove production).
- Separately provisioned authenticated HTTPS GPU worker endpoint(s), capacity and allowed egress; rates for each GPU instance.
- Stable Audio 3 gated checkpoint rights/registration; each self-host model must be pinned by revision/hash and scanned.
- MusicGen separately confirmed research-only use; otherwise it remains unselectable.
- A measured test run (not source-only merge) is required before calling any of the six genuinely operational.

## Acceptance/evidence
Two or six checked choices produce exactly two or six independent backend attempts; same prompt stored and displayed; licenses reflected. Only configured/licensed providers dispatch. The admin can hear results and download CSV; historical batch retains exact provider, model and rate snapshots. Confirm total billed units reconcile to provider invoices or mark estimates. Compare gross and marginal costs and report a quality-adjusted cost per usable song. Never equate emulator/mock success to real GPU/music/provider success.
