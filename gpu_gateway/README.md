# Private GPU gateway: deployment and model isolation

The Python gateway is an **implementation**, not a currently provisioned or tested cloud GPU. It implements the OurJam private inference contract for **HeartMuLa**, **Stable Audio 3 Medium**, and **MusicGen noncommercial research**. ACE-Step 1.5 uses its own documented REST server; Mureka and Stable Audio 2.5 remain hosted API services.

## Minimum host

Use a GPU machine with adequate VRAM, Python 3.12, ffmpeg/ffprobe, a restricted persistent disk, firewall-denied public loopback port, and **TLS at an authenticated reverse proxy**. Allocate only the GPUs the selected checkpoints actually need; model and GPU compatibility require a real smoke test. The service deliberately binds to 127.0.0.1 by default and rejects direct public binding.

Place secrets in the GPU host's private environment, not in GitHub or browser:

```sh
export GPU_GATEWAY_TOKEN="<a-strong-random-secret-at-least-32-characters>"
export GPU_GATEWAY_DATA_DIR="/secure-private-disk/ourjam-gpu"
export GPU_GATEWAY_MAX_SECONDS="600"
export HEARTMULA_CHECKPOINT_APPROVED="1"
export HEARTMULA_REPO_DIR="/opt/heartlib"
export HEARTMULA_CHECKPOINT_DIR="/opt/heartlib/ckpt"
export STABLE_AUDIO_OPEN_LICENSE_APPROVED="1"
export MUSICGEN_NONCOMMERCIAL_RESEARCH_APPROVED="1"
python3 -m gpu_gateway.server
```

The environment values above are **examples of variable names, not owner consent to licenses**. Set approval flags only after appropriate rights actually confirmed. Requirements are isolated per model and should be installed into dedicated/pinned virtual environments before enabling them. `python -m unittest -v gpu_gateway.test_gateway` runs only local mock tests and will not download checkpoints or rent GPUs.

### Official inference entrypoints

- HeartMuLa official: `python examples/run_music_generation.py --model_path=... --version=3B --tags=... --lyrics=... --save_path=... --max_audio_length_ms=...`. Supply the official checkpoint directory and install heartlib and codecs from the upstream repository. The server writes `[Instrumental]` to the private lyrics file. Actual instrumental-only performance must be auditioned.
- Stable Audio 3 Medium official: `stable-audio --model medium -p "..." --duration 30 -o track.wav`, then FFmpeg converts to MP3. Requires the official Stable Audio 3 distribution and gated checkpoint rights; medium needs CUDA and Flash Attention.
- MusicGen research only: `python -m gpu_gateway.musicgen_runner` using an approved `facebook/musicgen-small` checkpoint, CUDA PyTorch, Transformers, and SoundFile; max 30 seconds on this explicit runner. **Do not** use these noncommercial weights for OurJam product development or commercial releases absent an appropriate license or rights grant.

Source references:
- https://github.com/HeartMuLa/heartlib
- https://github.com/Stability-AI/stable-audio-3
- https://github.com/facebookresearch/audiocraft
- https://huggingface.co/facebook/musicgen-small

The host's web API has **no CORS permissions** and uses a constant-time Bearer comparison. POST accepts a fixed schema, exactly one instrumental output and pinned model IDs; GET returns status or the host's own generated MP3 bytes. It never accepts an arbitrary download destination, executable or external URL.

### Durable task behavior

One background model runner dispatches queued work serially. SQLite WAL saves task IDs before HTTP acknowledgment. A task that was `running` before a gateway restart becomes **unknown**, never requeued. Unknown receipts must be investigated; do not resubmit. A result is saved under the server-generated UUID filename, never a browser path. The Node worker validates media again, stores it in separate private S3 storage and only exposes it through administrator-only signed delivery. Results remain on the GPU host until explicit retention cleanup.

### Billing limits and safety

`GPU_GATEWAY_MAX_SECONDS` kills the local inference subprocess process group, but **does not cancel a rented cloud GPU or stop the cloud provider's billing clock**. Configure independent rented-instance auto-stop, plan caps and billing alerts in the GPU provider before setting `COMPARISON_GPU_HOST_BILLING_LIMIT_ACK=1` on the Node server. The Node admin preflight uses that host's *enforced billable-time allocation*, not a fantasy $0 model price. There is still no actual billable GPU-time integration until provider metering/invoices are ingested.

Never expose `GPU_GATEWAY_TOKEN`, S3, database, or provider API secrets to the browser, event artist, fan, or source repository. Use only the project-specific database and object store. No external audit sign-off is required to continue implementation/testing; actual vulnerabilities and failing security checks must still be fixed before deployment.

**Not yet done:** automated GPU-provider provisioning/stop, actual model weights download, live license entitlement checks, real inference quality/latency tests, exact supplier invoice collection, hardware E2E testing. None of these are represented as passed by Python mock tests.
