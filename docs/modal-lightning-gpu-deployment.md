# OurJam: Modal + Lightning AI GPU deployment

Status: **source integration present; neither cloud account nor a GPU has been provisioned**. This is for platform-admin, isolated instrumental model comparisons, not live show generation or payments. Credentials and model checkpoints stay in owner-managed secrets. The hosted use does not make a model's weights commercially licensed.

## What is being compared

The owner selects 1–6 music *models* (Mureka 9.5 API, Stable Audio 3 API, ACE-Step XL-SFT with 4B LM, HeartMuLa newest publicly downloadable 3B checkpoint, Stable Audio 3 Medium open weights, and MusicGen Large for genuine noncommercial research only). Modal and Lightning AI are **alternative GPU locations**, not additional generation models. Choosing Modal versus Lightning does not change the checkpoint. Each new batch stores its selected GPU location, checkpoint and rate card. Already-prepared runs retain their original snapshot.

GPU priority: **music quality first**. Begin with an L40S (48 GB), but benchmark RAM/VRAM before claiming that every large model loads there. Model labels here identify approved checkpoint families; downloadable weights, hashes and license entitlements must be verified separately. Do not substitute a smaller checkpoint silently if it will not fit. Stable Audio 3 *Large* is not available as standard community self-hosted weights; Medium remains the best normally downloadable tier.

## 1. Modal (primary host; recurring credit)

Create a [Modal account](https://modal.com/) and configure limits under [Usage & Billing](https://modal.com/settings): **Workspace budget** and **out-of-pocket spend limit**. The latter can cap net charges after any credits. Free Starter credit is typically renewed each month. Limits cap financial exposure across the workspace, not necessarily a single music request; app quotes are *projections*.

A Modal Python app is implemented at `gpu_gateway/modal_deploy.py` and defines two authenticated HTTPS functions:

- `gateway_server` on L40S GPU, with the private `/v1/jobs` protocol for HeartMuLa, Stable Audio 3 Medium and MusicGen Large research-only.
- `ace_step_server` on its own L40S GPU with the official ACE-Step `/release_task` and `/query_result` API.

Both use `min_containers=0`, `max_containers=1`, and a 180-second container idle window to avoid perpetually warm paid GPUs. Startup and idle time are **not free**. A Modal persistent volume stores job receipts and private audio; the gateway checkpoints volume state after durable changes. Model inference files and checkpoint weights must be built into version-pinned private runtime container images before deployment. The templates **do not include fake weights**.

The deployment command from the repository root (after logging in to Modal through `modal setup`):

```bash
python3 -m pip install modal
export OURJAM_MODAL_GATEWAY_IMAGE='your-private-registry/ourjam-gpu@sha256:YOUR_VERIFIED_DIGEST'
export OURJAM_MODAL_ACE_IMAGE='your-private-registry/ace-step@sha256:YOUR_VERIFIED_DIGEST'
modal deploy gpu_gateway/modal_deploy.py
```

Use the [Modal Secrets dashboard](https://modal.com/secrets) to create exactly two private secrets:

- `ourjam-comparison-gpu-gateway`: `GPU_GATEWAY_TOKEN` (random >=32 characters), `GPU_GATEWAY_MAX_SECONDS=600`, verified per-model checkpoint/license acknowledgments; access-controlled model tokens if necessary.
- `ourjam-comparison-ace`: `ACESTEP_API_KEY` (random >=32 characters) and any model-specific licensed checkpoint/Hugging Face tokens. The function forces `ACESTEP_CONFIG_PATH=acestep-v15-xl-sft`, `ACESTEP_LM_MODEL_PATH=acestep-5Hz-lm-4B`, and enables the planner.

The resulting **actual** HTTPS function URLs are printed by Modal during deployment. In the **separate development/comparison worker configuration**, set:

```ini
MODAL_GPU_GATEWAY_URL=https://YOUR-WORKSPACE--ourjam-private-comparison-gpu-gateway-server.modal.run/
MODAL_GPU_GATEWAY_TOKEN=...matching GPU_GATEWAY_TOKEN...
MODAL_ACE_STEP_BASE_URL=https://YOUR-WORKSPACE--ourjam-private-comparison-gpu-ace-step-server.modal.run/
MODAL_ACE_STEP_TOKEN=...matching ACESTEP_API_KEY...
MODAL_GPU_SKU=Modal L40S
```

Those URLs are illustrative, not verified endpoints. Set actual URLs provided by your workspace; do not embed secrets in source code or client UI. Add per-provider `gpu_hour` rate cards for the exact `Modal L40S` SKU in `/admin`. Include Modal compute, CPU/memory, storage and network charges in eventual invoice reconciliation.

## 2. Lightning AI (secondary host; introductory GPU credits)

Create a [Lightning AI account](https://lightning.ai/) and a **GPU Studio** with a GPU large enough for the selected checkpoint (suggest L40S to begin). Verify whether your account has introductory credits, whether a payment method is required, current allowances, GPU availability and [billing controls](https://lightning.ai/pricing). Intro credits are not a promise of unlimited recurring free GPU inference.

Clone the repo into the GPU Studio and build the **official licensed** model environments following `gpu_gateway/README.md`. Set private variables `GPU_GATEWAY_TOKEN`, `ACESTEP_API_KEY`, `GPU_GATEWAY_MAX_SECONDS`, and model/checkpoint paths. Before running either script, enable and verify Lightning's **managed HTTPS Ports** exposure and set `LIGHTNING_GPU_STUDIO_TLS_PROXY_ACK=1` only after confirming that proxy. The script refuses to start without an NVIDIA GPU or this acknowledgment:

```bash
bash gpu_gateway/lightning_start_gateway.sh
bash gpu_gateway/lightning_start_ace.sh
```

Launch them in **separate terminal/process sessions**. They listen on ports 8085 and 8001 respectively. Do not bind raw host firewall ports directly to the public Internet, do not make the Studio publicly editable, and do not publish the tokens. See [Lightning Studio web app hosting](https://lightning.ai/docs/platform/build/host-web-apps) for securely exposing ports.

Enter the **actual** HTTPS URLs assigned by Lightning's proxy and matching bearer tokens only in backend environment settings:

```ini
LIGHTNING_GPU_GATEWAY_URL=https://ACTUAL-LIGHTNING-GATEWAY-HTTPS-ORIGIN/
LIGHTNING_GPU_GATEWAY_TOKEN=...matching GPU_GATEWAY_TOKEN...
LIGHTNING_ACE_STEP_BASE_URL=https://ACTUAL-LIGHTNING-ACE-HTTPS-ORIGIN/
LIGHTNING_ACE_STEP_TOKEN=...matching ACESTEP_API_KEY...
LIGHTNING_GPU_SKU=Lightning L40S
```

Set dated `gpu_hour` rate cards with SKU `Lightning L40S`. Lightning Studio instances may continue consuming credits while running even when not generating music. **Stop/suspend the GPU Studio** immediately after experiments and verify that billed time stopped. An interactive free Studio is not a production 24/7 guaranteed endpoint. Move to an authenticated Lightning deployment with appropriate billing ceilings only after successful tests.

## 3. Owner's six-model admin flow

1. Set the existing project-private `ADMIN_TOKEN`, `DATABASE_URL`, and `MEDIA_*` settings. Run additive migrations up through `024` on the correct database. Do not touch rehearsal until approved and smoke-tested.
2. Set only truthful checkpoint licensing flags (`ACE_STEP_CHECKPOINT_APPROVED`, `HEARTMULA_CHECKPOINT_APPROVED`, `STABLE_AUDIO_OPEN_LICENSE_APPROVED` as appropriate). **Never** set MusicGen research approval for commercial product development.
3. Set `COMPARISON_GENERATION_ENABLED=1` only on the dedicated comparison worker when ready, and `COMPARISON_COMMERCIAL_RIGHTS_APPROVED=1` only when the selected rights allow commercial use.
4. Set `COMPARISON_GPU_ENFORCED_BILLING_SECONDS` (30–3600). Only set `COMPARISON_GPU_HOST_BILLING_LIMIT_ACK=1` after your provider billing limit and time ceiling **really are enforced**, not merely because an HTTP request times out.
5. In `/admin` choose Modal or Lightning; select any combination of six music models. Save configuration (costs $0), prepare a test (costs $0), inspect readiness and quote (costs $0), and explicitly approve the cost ceiling and start the queued comparison. The separate worker then performs generation only if running and authorized.
6. Listen with the private blind A/B audition, rate usable tracks and reconcile actual GPU/API bills. The report distinguishes model quality and cost per **approved usable** instrumental.

Only results from real checkpoint generation and verifiable provider bills count as live tests. Failed or unknown jobs can still consume resources; never treat missing invoices as $0.

## Important access and deployment boundary

No cloud GPU, credit or billing account is accessible to this repository merely because configuration scripts exist. Deployment still needs (1) owner Modal/Lightning login, (2) provider-specific authenticated endpoint credentials, (3) GPU quota and model-runtime images/checkpoints, (4) commercial-license/gated-model approval, and (5) actual spend/billing caps. Nothing in the deployment sources creates a bill without the owner explicitly authenticating and invoking deployment.

Models are pinned by name; a real preflight should additionally pin downloadable **model weight revision hashes** and check GPU VRAM and model API compatibility before authorizing actual charges. MusicGen weights cannot be used for a commercial OurJam test by relabeling it "private research".
