#!/usr/bin/env bash
# Launch official ACE-Step 1.5 XL-SFT + 4B planner in Lightning GPU Studio.
set -euo pipefail
if [ "${LIGHTNING_GPU_STUDIO_TLS_PROXY_ACK:-}" != "1" ]; then
  echo "Refusing ACE-Step start: confirm HTTPS-managed Studio port is enabled." >&2
  exit 2
fi
if [ -z "${ACESTEP_API_KEY:-}" ] || [ "${#ACESTEP_API_KEY}" -lt 32 ]; then
  echo "Refusing ACE-Step start: private ACESTEP_API_KEY must be at least 32 characters." >&2
  exit 2
fi
if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "Refusing ACE-Step start: no NVIDIA GPU attached." >&2
  exit 2
fi
export ACESTEP_API_HOST=0.0.0.0
export ACESTEP_API_PORT=8001
export ACESTEP_API_WORKERS=1
export ACESTEP_CONFIG_PATH=acestep-v15-xl-sft
export ACESTEP_INIT_LLM=true
export ACESTEP_LM_MODEL_PATH=acestep-5Hz-lm-4B
export ACESTEP_LM_BACKEND=pt
export ACESTEP_QUEUE_WORKERS=1
umask 077
exec python3 -m acestep.api_server
