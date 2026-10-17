#!/usr/bin/env bash
# Launch the private OurJam GPU gateway in an authenticated Lightning GPU Studio.
# Expose the port only using Lightning's managed HTTPS proxy.
set -euo pipefail
if [ "${LIGHTNING_GPU_STUDIO_TLS_PROXY_ACK:-}" != "1" ]; then
  echo "Refusing start: confirm the Studio's managed HTTPS port proxy is in use." >&2
  exit 2
fi
if [ -z "${GPU_GATEWAY_TOKEN:-}" ] || [ "${#GPU_GATEWAY_TOKEN}" -lt 32 ]; then
  echo "Refusing start: GPU_GATEWAY_TOKEN must be at least 32 characters." >&2
  exit 2
fi
if [ "${GPU_GATEWAY_MAX_SECONDS:-0}" -lt 30 ] || [ "${GPU_GATEWAY_MAX_SECONDS:-999999}" -gt 3600 ]; then
  echo "Refusing start: set a bounded GPU_GATEWAY_MAX_SECONDS (30..3600)." >&2
  exit 2
fi
if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "Refusing start: Lightning Studio has no visible NVIDIA GPU." >&2
  exit 2
fi
if [ -z "$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n 1)" ]; then
  echo "Refusing start: NVIDIA GPU is not ready." >&2
  exit 2
fi
export GPU_GATEWAY_EDGE_PROVIDER=lightning
export GPU_GATEWAY_EDGE_TLS_ACK=1
export GPU_GATEWAY_BIND=0.0.0.0
export GPU_GATEWAY_PORT=8085
export GPU_GATEWAY_DATA_DIR="${GPU_GATEWAY_DATA_DIR:-$HOME/.ourjam-gpu-private}"
umask 077
exec python3 -m gpu_gateway.server
