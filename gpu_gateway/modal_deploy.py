"""Modal deployment entrypoints for OurJam private GPU music comparisons.

No machine is provisioned merely by importing this file. Running modal deploy
requires the owner's connected Modal account, prebuilt/pinned model runtimes
and named secrets. Both functions scale to zero when idle.
"""
from __future__ import annotations

import os
import modal

GATEWAY_IMAGE = os.environ.get("OURJAM_MODAL_GATEWAY_IMAGE")
ACE_IMAGE = os.environ.get("OURJAM_MODAL_ACE_IMAGE")
if not GATEWAY_IMAGE or not ACE_IMAGE:
    raise RuntimeError(
        "Set immutable OURJAM_MODAL_GATEWAY_IMAGE and OURJAM_MODAL_ACE_IMAGE "
        "to previously built, tested private images before deployment."
    )
if "@sha256:" not in GATEWAY_IMAGE or "@sha256:" not in ACE_IMAGE:
    raise RuntimeError("Pin both model runtime images by immutable sha256 digest.")

app=modal.App("ourjam-private-comparison-gpu")
gateway_image=modal.Image.from_registry(GATEWAY_IMAGE,add_python="3.12").pip_install("modal").add_local_python_source("gpu_gateway")
ace_image=modal.Image.from_registry(ACE_IMAGE,add_python="3.12")
gateway_volume=modal.Volume.from_name("ourjam-comparison-gateway-state",create_if_missing=True)
ace_volume=modal.Volume.from_name("ourjam-comparison-ace-output",create_if_missing=True)
gateway_secret=modal.Secret.from_name("ourjam-comparison-gpu-gateway")
ace_secret=modal.Secret.from_name("ourjam-comparison-ace")

@app.function(
    gpu="L40S",image=gateway_image,
    secrets=[gateway_secret],
    volumes={"/data":gateway_volume},
    timeout=3600,
    min_containers=0,max_containers=1,scaledown_window=180,
)
@modal.web_server(8085,startup_timeout=300)
def gateway_server():
    import subprocess,sys,os
    required=("GPU_GATEWAY_TOKEN",)
    if any(len(os.environ.get(key,""))<32 for key in required):
        raise RuntimeError("Missing strong Modal private gateway secret.")
    env={
        **os.environ,"GPU_GATEWAY_BIND":"0.0.0.0","GPU_GATEWAY_PORT":"8085",
        "GPU_GATEWAY_EDGE_PROVIDER":"modal","GPU_GATEWAY_EDGE_TLS_ACK":"1",
        "GPU_GATEWAY_MODAL_VOLUME_NAME":"ourjam-comparison-gateway-state",
        "GPU_GATEWAY_DATA_DIR":"/data/gateway",
        "GPU_GATEWAY_MAX_SECONDS":"600",
    }
    subprocess.Popen([sys.executable,"-m","gpu_gateway.server"],env=env,
      stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
      start_new_session=True)

@app.function(
    gpu="L40S",image=ace_image,
    secrets=[ace_secret],
    volumes={"/data":ace_volume},
    timeout=3600,
    min_containers=0,max_containers=1,scaledown_window=180,
)
@modal.web_server(8001,startup_timeout=300)
def ace_step_server():
    import subprocess,sys,os
    token=os.environ.get("ACESTEP_API_KEY","")
    if len(token)<32:raise RuntimeError("Missing strong ACE-Step bearer API secret.")
    env={
        **os.environ,"ACESTEP_API_HOST":"0.0.0.0","ACESTEP_API_PORT":"8001",
        "ACESTEP_API_KEY":token,
        "ACESTEP_CONFIG_PATH":"acestep-v15-xl-sft",
        "ACESTEP_INIT_LLM":"true",
        "ACESTEP_LM_MODEL_PATH":"acestep-5Hz-lm-4B",
        "ACESTEP_LM_BACKEND":"pt",
        "ACESTEP_TMPDIR":"/data/ace-tmp",
        "ACESTEP_QUEUE_WORKERS":"1",
    }
    subprocess.Popen([sys.executable,"-m","acestep.api_server"],env=env,
      stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
      start_new_session=True)
