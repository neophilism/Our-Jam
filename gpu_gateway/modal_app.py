"""Modal serverless deployment adapter for OurJam's authenticated gateway.

Deploy a *separate app per quality-first checkpoint*, each using an independently
reviewed GPU image containing that engine's official dependencies and weights.
Only the no-GPU HTTP ingress is used for polling. Every inference uses a GPU
Function that scales down when idle; no always-on rented GPU is needed.
"""
from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4
import modal
from gpu_gateway.runners import KNOWN_MODELS, MAX_AUDIO_BYTES, validate_job

ENGINE=os.environ.get("OURJAM_MODAL_ENGINE","")
if ENGINE not in KNOWN_MODELS:
    raise RuntimeError("Set OURJAM_MODAL_ENGINE to one approved engine before deploying.")
MODEL=KNOWN_MODELS[ENGINE]
GPU_IMAGE=os.environ.get("OURJAM_MODAL_GPU_IMAGE","")
if not GPU_IMAGE or "@sha256:" not in GPU_IMAGE:
    raise RuntimeError("Set OURJAM_MODAL_GPU_IMAGE to an inspected, digest-pinned model image.")
GPU_TYPE=os.environ.get("OURJAM_MODAL_GPU_TYPE","L40S")
if GPU_TYPE not in {"L40S","A100-40GB","A100-80GB","H100","H200"}:
    raise RuntimeError("Unsupported GPU type; select an approved compatible GPU.")
NAME="ourjam-"+ENGINE.replace("_","-")
app=modal.App(NAME)
secret=modal.Secret.from_name("ourjam-private-gateway")
data=modal.Dict.from_name(NAME+"-jobs",create_if_missing=True)
volume=modal.Volume.from_name(NAME+"-audio",create_if_missing=True)
gateway_image=modal.Image.debian_slim(python_version="3.11").pip_install("fastapi>=0.112,<1").add_local_python_source("gpu_gateway")
gpu_image=modal.Image.from_registry(GPU_IMAGE).add_local_python_source("gpu_gateway")

@app.function(image=gpu_image,secrets=[secret],gpu=GPU_TYPE,timeout=3600,max_containers=1,
              scaledown_window=30,volumes={"/results":volume})
def run_gpu(job_id:str,job:dict)->None:
    """One user-approved, pre-priced model invocation; never run from GET."""
    import os
    import shutil
    import tempfile
    from pathlib import Path
    from gpu_gateway.runners import run_engine
    if job.get("engine")!=ENGINE or job.get("model")!=MODEL:raise RuntimeError("checkpoint_mismatch")
    active=dict(data[job_id])
    if active.get("state")!="queued":return
    active["state"]="running"
    data[job_id]=active
    path=Path("/results")/(job_id+".mp3")
    try:
        with tempfile.TemporaryDirectory(prefix="ourjam-gpu-") as tmp:
            elapsed=run_engine(ENGINE,MODEL,job["purpose"],job["description"],
                               job["durationSeconds"],Path(tmp),path,dict(os.environ))
        if not path.is_file() or not 1000<=path.stat().st_size<=MAX_AUDIO_BYTES:
            raise RuntimeError("invalid_audio")
        volume.commit()
        active.update(state="succeeded",elapsedSeconds=elapsed,error=None)
    except Exception:
        # The provider receipt may have been issued already. Retain a terminal
        # failure; the Node caller never retries or switches hosts automatically.
        active.update(state="failed",error="inference_failed")
    data[job_id]=active

@app.function(image=gateway_image,secrets=[secret],timeout=120,scaledown_window=20)
@modal.asgi_app()
def gateway():
    import hmac
    from fastapi import FastAPI,Request,HTTPException
    from fastapi.responses import Response
    from gpu_gateway.runners import validate_job,RunnerError
    web=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)

    def assert_auth(req:Request):
        correct="Bearer "+os.environ.get("GPU_GATEWAY_TOKEN","")
        if len(os.environ.get("GPU_GATEWAY_TOKEN",""))<32:
            raise HTTPException(503,"gateway_not_configured")
        if not hmac.compare_digest(req.headers.get("authorization",""),correct):
            raise HTTPException(401,"unauthorized")
    @web.get("/healthz")
    def health():
        return {"status":"ok"}
    @web.get("/v1/health")
    def readiness(req:Request):
        assert_auth(req)
        key="GPU_GATEWAY_MODEL_READY_"+ENGINE.upper()
        licensed={
            "ace_step":"ACE_STEP_CHECKPOINT_APPROVED",
            "heartmula":"HEARTMULA_CHECKPOINT_APPROVED",
            "stable_audio_open":"STABLE_AUDIO_OPEN_LICENSE_APPROVED",
            "musicgen":"MUSICGEN_NONCOMMERCIAL_RESEARCH_APPROVED",
        }[ENGINE]
        return {"ok":True,"models":[{"engine":ENGINE,"model":MODEL,"available":
          os.environ.get(key)=="1" and os.environ.get(licensed)=="1"}]}
    @web.post("/v1/jobs",status_code=202)
    async def submit(req:Request):
        assert_auth(req)
        if int(req.headers.get("content-length","0") or 0)>16384:raise HTTPException(413,"too_large")
        try:
            job=await req.json()
            if not isinstance(job,dict) or set(job)!={"engine","model","purpose","description",
                "durationSeconds","instrumental","outputs"}:
                raise RunnerError("invalid_payload")
            if job["engine"]!=ENGINE or job["model"]!=MODEL or job["instrumental"] is not True or job["outputs"]!=1:
                raise RunnerError("model_unavailable")
            validate_job(ENGINE,MODEL,job["purpose"],job["description"],
                         job["durationSeconds"],dict(os.environ))
        except (ValueError,KeyError,RunnerError):
            raise HTTPException(400,"unapproved_job")
        job_id=str(uuid4())
        data[job_id]={"id":job_id,"engine":ENGINE,"model":MODEL,"state":"queued","error":None}
        try:
            # Dispatch happens at most once; no remote calls on status polling.
            await run_gpu.spawn.aio(job_id,job)
        except Exception:
            data[job_id]={"id":job_id,"engine":ENGINE,"model":MODEL,"state":"unknown"}
            raise HTTPException(503,"acceptance_unknown")
        return {"id":job_id}
    @web.get("/v1/jobs/{job_id}")
    def status(job_id:str,req:Request):
        assert_auth(req)
        if not re_id(job_id):raise HTTPException(404,"not_found")
        item=data.get(job_id)
        if not item:raise HTTPException(404,"not_found")
        return {"id":item["id"],"engine":ENGINE,"model":MODEL,"state":item["state"],
                "contentType":"audio/mpeg" if item["state"]=="succeeded" else None}
    @web.get("/v1/jobs/{job_id}/audio")
    def audio(job_id:str,req:Request):
        assert_auth(req)
        if not re_id(job_id):raise HTTPException(404,"not_found")
        item=data.get(job_id)
        if not item or item["state"]!="succeeded":raise HTTPException(409,"audio_not_ready")
        volume.reload()
        file=Path("/results")/(job_id+".mp3")
        if not file.is_file() or file.is_symlink() or not 1000<=file.stat().st_size<=MAX_AUDIO_BYTES:
            raise HTTPException(404,"audio_missing")
        return Response(file.read_bytes(),media_type="audio/mpeg",
                        headers={"Cache-Control":"private, no-store"})
    def re_id(value:str)->bool:
        import re
        return bool(re.fullmatch(r"[a-f0-9-]{36}",value))
    return web
