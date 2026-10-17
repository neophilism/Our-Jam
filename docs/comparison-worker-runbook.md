# Isolated six-engine comparison worker (development)

This worker **never** runs inside live event generation. It is not started by the website. It consumes **only** explicit, administratively approved and durably queued comparison runs. Do not turn it on until a real private object store, provider license approvals, price cards, and billing ceilings have been configured.

## Startup

Run SQL migrations through the normal project-specific migration procedure (comparison tables `021` and price cards `022`). On a suitable private worker instance set its project-scoped `DATABASE_URL` and `MEDIA_*` storage variables, then:

```shell
npm ci
npm run build:server
COMPARISON_GENERATION_ENABLED=1 npm run start:comparison-worker
```

This command does **not** provision hardware; no billing occurs just by committing the worker. It processes one job at a time on one worker process. Several instances may claim distinct rows under SQL `SKIP LOCKED` but provider hosts must enforce actual parallelism/GPU limits independently.

## API credentials and model endpoints

The comparison worker reads `MUREKA_API_KEY` and `STABLE_AUDIO_KEY` (or `STABILITY_API_KEY`) for the existing hosted providers. It **does not** use `GENERATION_EVENT_BUDGET_CENTS` or the live-show `GENERATION_ENABLED` flag. Separate comparison permission/budget is explicit.

For self-hosted:
- ACE-Step 1.5: `ACE_STEP_BASE_URL` (HTTPS root), `ACE_STEP_TOKEN`, `ACE_STEP_MODEL` (default `acestep-v15-turbo`), `ACE_STEP_CHECKPOINT_APPROVED=1`. Its own server implements `POST /release_task`, `POST /query_result`, `GET /v1/audio?path=...` with Bearer auth. The host must enforce authentication and not redirect to third-party audio.
- HeartMuLa: `OURJAM_GPU_GATEWAY_URL` and `OURJAM_GPU_GATEWAY_TOKEN`, `HEARTMULA_MODEL` (default `HeartMuLa-oss-3B`), `HEARTMULA_CHECKPOINT_APPROVED=1`.
- Stable Audio 3 Medium open weights: same gateway, `STABLE_AUDIO_OPEN_MODEL` (default `stable-audio-3-medium`), `STABLE_AUDIO_OPEN_LICENSE_APPROVED=1` after actual gated terms/eligibility verified.
- MusicGen: same gateway, `MUSICGEN_MODEL` (default `facebook/musicgen-small`), `MUSICGEN_NONCOMMERCIAL_RESEARCH_APPROVED=1`. Only actual **noncommercial research** can use its noncommercial weights; product development for commercial distribution is not necessarily research. Do not treat privacy alone as permission.

Three self-hosted engines use the OurJam-owned gateway contract, not a nonexistent vendor HTTP API:

```text
POST /v1/jobs                 returns {id}
GET  /v1/jobs/:id             returns {id, engine, model, state, contentType}
GET  /v1/jobs/:id/audio       returns validated audio/mpeg
```

The gateway **is not supplied by an API key**. It must be separately deployed on licensed GPU hardware with actual approved model checkpoints. The node client requires a private HTTPS root and bearer key, persists task receipts, and refuses unknown cross-host audio URLs. This contract and the associated mock tests cannot certify that a given GPU image will run a model.

## Rights, limits and recorded costs

- `COMPARISON_GENERATION_ENABLED=1` opts in to generation on that environment; zero-charge rehearsal defaults remain unchanged.
- `COMPARISON_COMMERCIAL_RIGHTS_APPROVED=1` is necessary for commercial evaluation. The person setting it must actually hold proper checkpoint/API rights.
- `COMPARISON_GPU_ENFORCED_BILLING_SECONDS` (integer 30–3600) and `COMPARISON_GPU_HOST_BILLING_LIMIT_ACK=1` indicate the **external** host really stops billing or terminates jobs at this limit. App-side timeout alone does not shut down rented GPU billing; never enable this setting on an unenforced host.
- `COMPARISON_GPU_SKU` or per-engine `ACE_STEP_GPU_SKU`, `HEARTMULA_GPU_SKU`, `STABLE_AUDIO_OPEN_GPU_SKU`, `MUSICGEN_GPU_SKU` selects one operator-entered GPU rate card for each model. API rate card must have one active `api_generation` entry.
- Admin's “Start” requires explicit positive ceiling greater than or equal to the all-provider **rate-card estimate**, then writes one immutable cost/rights snapshot per job. Neither the application nor the worker may create a charge for a *prepared-only* batch.
- Saved worker elapsed seconds are observed; **billable GPU seconds and supplier invoices are unknown** until host billing and invoice reconciliation is added. The `comparison_usage_events` entries are labeled *estimates*, never invoiced or actual. Failed/unknown requests may still have incurred charges.
- In-flight unknown tasks, missing receipts and expired worker leases are never blindly retried. The worker makes no changes to live events, releases, Sound Waves, voting, payments or identity.
- Private files use `comparison/<batch>/<run>/<attempt>/<sha256>.mp3` keys; the admin-only download route issues a short-lived signed URL. No public fans can retrieve comparison audio from the OurJam API.

## Model integration references

- ACE-Step official REST docs: https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md
- HeartMuLa official CLI: https://github.com/HeartMuLa/heartlib (example: `python examples/run_music_generation.py --model_path=./ckpt --version=3B`)
- Stable Audio 3 official repo and CLI: https://github.com/Stability-AI/stable-audio-3 (example: `stable-audio --model medium -p "..." --duration 30 -o track.wav`)
- MusicGen weight rights: https://huggingface.co/facebook/musicgen-small and https://github.com/facebookresearch/audiocraft

**Not verified:** actual checkpoint downloads, real GPU inference, audio quality, host timeouts, billable hours, supplier invoice reconciliation or commercial-rights eligibility. Do not claim six generators work live until all real-engine tests have passed.
