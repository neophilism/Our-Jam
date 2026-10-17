"""Durable, authenticated, strictly private OurJam GPU gateway.

Run bound to localhost behind a TLS reverse proxy. No public preview and no
client-provided URLs/commands. One inference job at a time per gateway process.
"""
from __future__ import annotations

import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
from typing import Callable
from uuid import uuid4

from .runners import KNOWN_MODELS, MAX_AUDIO_BYTES, RunnerError, run_engine, validate_job

JOB_PATTERN = re.compile(r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")
POST_FIELDS={"engine","model","purpose","description","durationSeconds","instrumental","outputs"}

class JobStore:
    def __init__(self,path:Path):
        self.path=path
        path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, engine TEXT NOT NULL, model TEXT NOT NULL,
                purpose TEXT NOT NULL, description TEXT NOT NULL, duration_seconds INTEGER NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed','unknown','cancelled')),
                error TEXT, elapsed_seconds REAL, created_at REAL NOT NULL, updated_at REAL NOT NULL
            )""")
            # A provider may have accepted inference before this process crashed.
            # Never silently retry an interrupted job on service restart.
            db.execute("UPDATE jobs SET state='unknown',error='gateway_interrupted',updated_at=? WHERE state='running'",(time.time(),))
    def connect(self):
        db=sqlite3.connect(self.path,timeout=20)
        db.row_factory=sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA busy_timeout=20000")
        return db
    def create(self,payload:dict)->str:
        job_id=str(uuid4())
        with self.connect() as db:
            db.execute("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,NULL,NULL,?,?)",
                (job_id,payload["engine"],payload["model"],payload["purpose"],
                 payload["description"],payload["durationSeconds"],"queued",time.time(),time.time()))
        return job_id
    def get(self,job_id:str)->dict|None:
        with self.connect() as db:
            row=db.execute("SELECT id,engine,model,state,error,elapsed_seconds FROM jobs WHERE id=?",(job_id,)).fetchone()
        return dict(row) if row else None
    def claim(self)->dict|None:
        db=self.connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            row=db.execute("SELECT * FROM jobs WHERE state='queued' ORDER BY created_at,id LIMIT 1").fetchone()
            if row:
                db.execute("UPDATE jobs SET state='running',updated_at=? WHERE id=? AND state='queued'",(time.time(),row["id"]))
            db.commit()
            return dict(row) if row else None
        except:
            db.rollback()
            raise
        finally:
            db.close()
    def finish(self,job_id:str,state:str,error:str|None,seconds:float|None):
        with self.connect() as db:
            db.execute("UPDATE jobs SET state=?,error=?,elapsed_seconds=?,updated_at=? WHERE id=? AND state='running'",
                (state,error,seconds,time.time(),job_id))

class Gateway:
    def __init__(self,root:Path,env:dict[str,str]|None=None,
                 runner:Callable[...,float]=run_engine):
        self.env=dict(os.environ if env is None else env)
        if not self.env.get("GPU_GATEWAY_TOKEN") or len(self.env["GPU_GATEWAY_TOKEN"])<32:
            raise RuntimeError("A strong private GPU_GATEWAY_TOKEN is required.")
        self.root=root.resolve()
        if root.is_symlink():raise RuntimeError("The GPU data directory cannot be a symlink.")
        self.root.mkdir(mode=0o700,parents=True,exist_ok=True)
        (self.root/"results").mkdir(mode=0o700,exist_ok=True)
        (self.root/"scratch").mkdir(mode=0o700,exist_ok=True)
        self.store=JobStore(self.root/"state.sqlite3")
        self.runner=runner
        self.stop=threading.Event()
        self.thread:threading.Thread|None=None
    def capabilities(self)->list[dict]:
        approvals={
            "ace_step":"ACE_STEP_CHECKPOINT_APPROVED",
            "heartmula":"HEARTMULA_CHECKPOINT_APPROVED",
            "stable_audio_open":"STABLE_AUDIO_OPEN_LICENSE_APPROVED",
            "musicgen":"MUSICGEN_NONCOMMERCIAL_RESEARCH_APPROVED",
        }
        return [
            {"engine":engine,"model":model,"available":(
                self.env.get(approvals[engine])=="1" and
                self.env.get("GPU_GATEWAY_MODEL_READY_"+engine.upper())=="1"
            )}
            for engine,model in KNOWN_MODELS.items()
        ]
    def submit(self,body:dict)->str:
        if not isinstance(body,dict) or set(body)!=POST_FIELDS:
            raise RunnerError("invalid_job_fields")
        if body.get("instrumental") is not True or body.get("outputs")!=1:
            raise RunnerError("only_one_instrumental_output_supported")
        engine=body.get("engine")
        model=body.get("model")
        purpose=body.get("purpose")
        description=body.get("description")
        duration=body.get("durationSeconds")
        validate_job(engine,model,purpose,description,duration,self.env)
        return self.store.create(body)
    def step(self)->bool:
        row=self.store.claim()
        if row is None:return False
        job_id=row["id"]
        destination=self.root/"results"/(job_id+".mp3")
        workdir=self.root/"scratch"/job_id
        try:
            started=time.monotonic()
            seconds=self.runner(row["engine"],row["model"],row["purpose"],row["description"],
                row["duration_seconds"],workdir,destination,self.env)
            if not destination.is_file() or destination.is_symlink() or not 1000<=destination.stat().st_size<=MAX_AUDIO_BYTES:
                raise RunnerError("missing_or_invalid_output")
            self.store.finish(job_id,"succeeded",None,seconds if isinstance(seconds,(int,float))else time.monotonic()-started)
        except RunnerError as error:
            self.store.finish(job_id,"failed",str(error),None)
        except Exception:
            # No traceback or model prompt is returned to HTTP clients.
            self.store.finish(job_id,"failed","unclassified_inference_error",None)
        finally:
            # Temporary prompt, tags, lyrics, and WAV files are not retained.
            import shutil
            shutil.rmtree(workdir,ignore_errors=True)
        return True
    def start(self):
        if self.thread and self.thread.is_alive():return
        self.thread=threading.Thread(target=self.loop,daemon=True)
        self.thread.start()
    def loop(self):
        while not self.stop.is_set():
            try:
                if not self.step():self.stop.wait(0.75)
            except Exception:
                self.stop.wait(2)
    def shutdown(self):
        self.stop.set()
        if self.thread:self.thread.join(timeout=1)

def make_handler(gateway:Gateway):
    class Handler(BaseHTTPRequestHandler):
        server_version="OurJamPrivateGPU/1.0"
        def log_message(self,fmt,*args):
            # Do not print prompts, task tokens, or requested URLs.
            pass
        def headers_json(self,status:int):
            self.send_response(status)
            self.send_header("Content-Type","application/json; charset=utf-8")
            self.send_header("Cache-Control","private, no-store")
            self.send_header("X-Content-Type-Options","nosniff")
        def result(self,status:int,body:dict):
            payload=json.dumps(body,separators=(",",":"),ensure_ascii=False).encode("utf-8")
            self.headers_json(status)
            self.send_header("Content-Length",str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        def authorized(self)->bool:
            provided=self.headers.get("Authorization","")
            correct="Bearer "+gateway.env["GPU_GATEWAY_TOKEN"]
            if not hmac.compare_digest(provided,correct):
                self.result(401,{"error":"unauthorized"})
                return False
            return True
        def do_POST(self):
            self.connection.settimeout(30)
            if not self.authorized():return
            if self.path!="/v1/jobs":
                self.result(404,{"error":"not_found"});return
            try:
                size=int(self.headers.get("Content-Length","0"))
                if not 2<=size<=16384 or self.headers.get("Content-Type","").split(";")[0]!="application/json":
                    raise ValueError()
                body=json.loads(self.rfile.read(size).decode("utf-8"))
            except (ValueError,UnicodeDecodeError,json.JSONDecodeError):
                self.result(400,{"error":"invalid_json"});return
            try:
                job_id=gateway.submit(body)
            except RunnerError as error:
                self.result(400,{"error":str(error)});return
            self.result(202,{"id":job_id})
        def do_GET(self):
            self.connection.settimeout(30)
            if not self.authorized():return
            if self.path=="/v1/health":
                self.result(200,{"ok":True,"models":gateway.capabilities()})
                return
            match=re.fullmatch(r"/v1/jobs/([a-f0-9-]{36})(/audio)?",self.path)
            if not match or not JOB_PATTERN.fullmatch(match.group(1)):
                self.result(404,{"error":"not_found"});return
            job=gateway.store.get(match.group(1))
            if not job:
                self.result(404,{"error":"not_found"});return
            if not match.group(2):
                self.result(200,{"id":job["id"],"engine":job["engine"],"model":job["model"],
                    "state":job["state"],"contentType":"audio/mpeg" if job["state"]=="succeeded" else None,
                    "elapsedSeconds":job["elapsed_seconds"]})
                return
            if job["state"]!="succeeded":
                self.result(409,{"error":"audio_not_ready"});return
            file=gateway.root/"results"/(job["id"]+".mp3")
            if file.is_symlink() or not file.is_file() or not 1000<=file.stat().st_size<=MAX_AUDIO_BYTES:
                self.result(404,{"error":"audio_missing"});return
            data=file.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type","audio/mpeg")
            self.send_header("Content-Length",str(len(data)))
            self.send_header("Cache-Control","private, no-store")
            self.send_header("X-Content-Type-Options","nosniff")
            self.end_headers()
            self.wfile.write(data)
    return Handler

def main():
    token=os.environ.get("GPU_GATEWAY_TOKEN","")
    if len(token)<32:raise SystemExit("Set a strong GPU_GATEWAY_TOKEN on the private host.")
    host=os.environ.get("GPU_GATEWAY_BIND","127.0.0.1")
    if host not in ("127.0.0.1","::1"):
        raise SystemExit("Direct public gateway binding forbidden. Use a TLS reverse proxy to localhost.")
    port=int(os.environ.get("GPU_GATEWAY_PORT","8085"))
    gateway=Gateway(Path(os.environ.get("GPU_GATEWAY_DATA_DIR","./.private-gpu-gateway")))
    gateway.start()
    server=ThreadingHTTPServer((host,port),make_handler(gateway))
    try:server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:pass
    finally:
        server.server_close()
        gateway.shutdown()
if __name__=="__main__":main()
