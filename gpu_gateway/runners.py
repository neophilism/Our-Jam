"""Private, opt-in GPU backends for approved official music checkpoints.

Only trusted server-side configuration selects executables and checkpoints.
No user-provided command, absolute path, URL, or shell expression is executed.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
from typing import Callable

MAX_AUDIO_BYTES = 32 * 1024 * 1024
KNOWN_MODELS = {
    "heartmula": "HeartMuLa-oss-3B-happy-new-year",
    "stable_audio_open": "stable-audio-3-medium",
    "musicgen": "facebook/musicgen-large",
}

class RunnerError(Exception):
    pass

def validate_job(engine: str, model: str, purpose: str, prompt: str, duration_seconds: int, env: dict[str, str]) -> None:
    if engine not in KNOWN_MODELS or model != KNOWN_MODELS[engine]:
        raise RunnerError("unapproved_checkpoint")
    if purpose not in ("private_research", "commercial_evaluation"):
        raise RunnerError("invalid_purpose")
    if not isinstance(prompt, str) or not 8 <= len(prompt) <= 3500:
        raise RunnerError("invalid_prompt")
    if isinstance(duration_seconds, bool) or not isinstance(duration_seconds, int) or not 10 <= duration_seconds <= 180:
        raise RunnerError("invalid_duration")
    if engine == "heartmula" and env.get("HEARTMULA_CHECKPOINT_APPROVED") != "1":
        raise RunnerError("heartmula_checkpoint_unapproved")
    if engine == "stable_audio_open" and env.get("STABLE_AUDIO_OPEN_LICENSE_APPROVED") != "1":
        raise RunnerError("stable_audio_model_license_unapproved")
    if engine == "musicgen":
        if purpose != "private_research" or env.get("MUSICGEN_NONCOMMERCIAL_RESEARCH_APPROVED") != "1":
            raise RunnerError("musicgen_noncommercial_only")
        if duration_seconds > 30:
            raise RunnerError("musicgen_max_30_seconds")

def validated_executable(value: str) -> str:
    if not value or not re.fullmatch(r"[A-Za-z0-9._/\\-]{1,500}", value):
        raise RunnerError("invalid_executable_configuration")
    if not shutil.which(value) and not Path(value).is_file():
        raise RunnerError("executable_unavailable")
    return value

def run_argv(args: list[str], timeout: int, *, cwd: str | None = None) -> float:
    """Process-group kill on timeout; this does not cancel the cloud GPU rental."""
    started = time.monotonic()
    process = subprocess.Popen(
        args, cwd=cwd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL, start_new_session=True,
    )
    try:
        exit_code = process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        raise RunnerError("inference_timeout")
    if exit_code != 0:
        raise RunnerError("inference_process_failed")
    return time.monotonic() - started

def valid_audio(path: Path) -> None:
    if not path.is_file() or path.is_symlink() or not 1000 <= path.stat().st_size <= MAX_AUDIO_BYTES:
        raise RunnerError("invalid_generated_audio")
    probe = validated_executable(os.environ.get("FFPROBE_PATH", "ffprobe"))
    result = subprocess.run([probe, "-v", "error", "-show_entries",
        "stream=codec_type:format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, timeout=20, check=False,
    )
    if result.returncode != 0:
        raise RunnerError("undecodable_generated_audio")
    try:
        metadata = json.loads(result.stdout)
        streams = metadata.get("streams", [])
        duration = float(metadata.get("format", {}).get("duration", 0))
        if len(streams) != 1 or streams[0].get("codec_type") != "audio" or not 5 <= duration <= 600:
            raise ValueError()
    except (ValueError, TypeError, KeyError):
        raise RunnerError("invalid_audio_metadata")

def run_engine(
    engine: str, model: str, purpose: str, prompt: str, duration_seconds: int,
    workdir: Path, output_mp3: Path,
    env: dict[str, str] | None = None,
    execute: Callable[..., float] = run_argv,
) -> float:
    config = dict(os.environ if env is None else env)
    validate_job(engine, model, purpose, prompt, duration_seconds, config)
    limit = int(config.get("GPU_GATEWAY_MAX_SECONDS", "600"))
    if not 30 <= limit <= 3600:
        raise RunnerError("invalid_inference_timeout")
    workdir.mkdir(mode=0o700, parents=True, exist_ok=True)
    output_mp3.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if engine == "heartmula":
        root = Path(config.get("HEARTMULA_REPO_DIR", ""))
        checkpoint = Path(config.get("HEARTMULA_CHECKPOINT_DIR", ""))
        if not root.is_dir() or not checkpoint.is_dir():
            raise RunnerError("heartmula_checkpoint_missing")
        (workdir / "tags.txt").write_text(prompt, encoding="utf-8")
        (workdir / "lyrics.txt").write_text("[Instrumental]\n", encoding="utf-8")
        python = validated_executable(config.get("PYTHON_EXECUTABLE", sys.executable))
        seconds = execute([python, "examples/run_music_generation.py",
            "--model_path", str(checkpoint), "--version", "3B", "--lazy_load", "true",
            "--tags", str(workdir / "tags.txt"), "--lyrics", str(workdir / "lyrics.txt"),
            "--save_path", str(output_mp3), "--max_audio_length_ms", str(duration_seconds * 1000)],
            limit, cwd=str(root))
    else:
        wav = workdir / "render.wav"
        if engine == "stable_audio_open":
            cli = validated_executable(config.get("STABLE_AUDIO_CLI", "stable-audio"))
            seconds = execute([cli, "--model", "medium", "-p", prompt, "--duration",
                str(duration_seconds), "-o", str(wav)], limit)
        else:
            python = validated_executable(config.get("PYTHON_EXECUTABLE", sys.executable))
            seconds = execute([python, "-m", "gpu_gateway.musicgen_runner",
                "--model", model, "--prompt", prompt,
                "--duration", str(duration_seconds), "--output", str(wav)], limit)
        ffmpeg = validated_executable(config.get("FFMPEG_PATH", "ffmpeg"))
        execute([ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin",
            "-i", str(wav), "-vn", "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame",
            "-b:a", "192k", "-y", str(output_mp3)], 90)
    valid_audio(output_mp3)
    return seconds
