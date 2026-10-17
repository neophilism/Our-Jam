"""Quality-first ACE-Step XL-SFT generation through upstream's localhost REST server.

The upstream server never binds a public interface. A new random API key is
generated per job and removed when the process exits. No prompt-controlled URL
is fetched: audio must be served from this exact localhost origin.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import re
import secrets
import signal
import socket
import subprocess
import sys
import time
from urllib import request, error, parse

class AceError(Exception):
    pass

def _port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])

def generate_ace(prompt: str, seconds: int, destination: Path, env: dict[str,str], timeout: int) -> float:
    repo=Path(env.get("ACESTEP_REPO_DIR","/opt/ACE-Step-1.5"))
    if not repo.is_dir():
        raise AceError("ace_step_source_unavailable")
    python=env.get("ACESTEP_PYTHON",sys.executable)
    if not Path(python).is_file():
        raise AceError("ace_step_python_unavailable")
    key=secrets.token_urlsafe(32)
    port=_port()
    root="http://127.0.0.1:"+str(port)
    child_env=dict(os.environ)
    child_env.update({
        "ACESTEP_CONFIG_PATH":"acestep-v15-xl-sft",
        "ACESTEP_LM_MODEL_PATH":"acestep-5Hz-lm-4B",
        "ACESTEP_INIT_LLM":"true",
        "ACESTEP_API_KEY":key,
        "ACESTEP_API_HOST":"127.0.0.1",
        "ACESTEP_API_PORT":str(port),
        "ACESTEP_NO_INIT":"false",
    })
    transport=request.build_opener(request.ProxyHandler({}))
    headers={"Authorization":"Bearer "+key,"Content-Type":"application/json","Accept":"application/json"}
    def get(path:str,deadline:float)->dict:
        if time.monotonic()>=deadline:raise AceError("ace_step_timeout")
        data=None
        if path.startswith("POST "):
            raise AceError("unexpected_post_url")
        req=request.Request(root+path,headers=headers)
        with transport.open(req,timeout=min(20,max(1,deadline-time.monotonic()))) as response:
            raw=response.read(64*1024+1)
            if len(raw)>64*1024:raise AceError("ace_step_response_too_large")
            return json.loads(raw)
    def post(path:str,payload:dict,deadline:float):
        if time.monotonic()>=deadline:raise AceError("ace_step_timeout")
        req=request.Request(root+path,headers=headers,
            data=json.dumps(payload,separators=(",",":")).encode("utf-8"),method="POST")
        with transport.open(req,timeout=min(60,max(1,deadline-time.monotonic()))) as response:
            raw=response.read(64*1024+1)
            if len(raw)>64*1024:raise AceError("ace_step_response_too_large")
            decoded=json.loads(raw)
            if decoded.get("code")!=200:raise AceError("ace_step_task_rejected")
            return decoded["data"]
    started=time.monotonic()
    deadline=started+timeout
    proc=subprocess.Popen([python,"-m","acestep.api_server","--host","127.0.0.1",
        "--port",str(port)],cwd=repo,env=child_env,stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    try:
        while time.monotonic()<deadline:
            if proc.poll() is not None:raise AceError("ace_step_server_failed")
            try:
                ready=get("/health",deadline)
                if ready.get("code")==200:break
            except (error.URLError,TimeoutError,OSError,ValueError):
                pass
            time.sleep(2)
        else:raise AceError("ace_step_startup_timeout")
        response=post("/release_task",{
            "prompt":prompt,"lyrics":"[Instrumental]","model":"acestep-v15-xl-sft",
            "thinking":True,"audio_duration":seconds,"audio_format":"mp3",
            "batch_size":1,"inference_steps":50,
        },deadline)
        receipt=response.get("task_id")
        if not isinstance(receipt,str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,128}",receipt):
            raise AceError("ace_step_invalid_receipt")
        while time.monotonic()<deadline:
            data=post("/query_result",{"task_id_list":[receipt]},deadline)
            if not isinstance(data,list):raise AceError("ace_step_invalid_status")
            item=next((x for x in data if x.get("task_id")==receipt),None)
            if not item:raise AceError("ace_step_missing_receipt")
            if item.get("status")==2:raise AceError("ace_step_failed")
            if item.get("status")==0:
                time.sleep(3);continue
            if item.get("status")!=1:raise AceError("ace_step_unknown_state")
            results=item.get("result")
            if isinstance(results,str):results=json.loads(results)
            file=results[0]["file"]
            url=parse.urlsplit(parse.urljoin(root,file))
            if url.scheme!="http" or url.hostname!="127.0.0.1" or url.port!=port or url.path!="/v1/audio":
                raise AceError("ace_step_unapproved_audio_origin")
            with transport.open(request.Request(url.geturl(),headers={"Authorization":"Bearer "+key}),
                timeout=min(50,max(1,deadline-time.monotonic()))) as response:
                data=response.read(32*1024*1024+1)
            if len(data)<1000 or len(data)>32*1024*1024:raise AceError("ace_step_invalid_audio_size")
            destination.write_bytes(data)
            return time.monotonic()-started
        raise AceError("ace_step_generation_timeout")
    finally:
        if proc.poll() is None:
            try:os.killpg(proc.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            proc.wait(timeout=5)
