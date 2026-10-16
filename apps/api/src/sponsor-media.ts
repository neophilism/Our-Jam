import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { requireThat } from "../../../packages/domain/src/index.js";
const exec = promisify(execFile);
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
export async function prepareSponsorVideo(bytes: Uint8Array) {
  requireThat(
    bytes.length >= 32 &&
      bytes.length <= MAX_VIDEO_BYTES &&
      Buffer.from(bytes).subarray(4, 8).toString() === "ftyp",
    "invalid_video",
    "Upload an MP4 video up to 64 MiB.",
  );
  const dir = await mkdtemp(path.join(tmpdir(), "our-jam-sponsor-"));
  const input = path.join(dir, "input.mp4"),
    output = path.join(dir, "silent.mp4");
  try {
    await writeFile(input, bytes, { mode: 0o600 });
    const { stdout } = await exec(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of",
        "json",
        input,
      ],
      { timeout: 30000, maxBuffer: 65536 },
    );
    const info = JSON.parse(stdout),
      duration = Number(info.format?.duration),
      streams = info.streams?.filter((s: any) => s.codec_type === "video");
    requireThat(
      Number.isFinite(duration) &&
        duration >= 1 &&
        duration <= 60 &&
        streams.length === 1 &&
        streams[0].width <= 3840 &&
        streams[0].height <= 2160,
      "invalid_video",
      "Use a 1–60 second MP4 with one video stream, up to 4K.",
    );
    await exec(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-an",
        "-map_metadata",
        "-1",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "24",
        "-vf",
        "scale=w='min(1920,iw)':h=-2",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: 120000, maxBuffer: 65536 },
    );
    const prepared = await readFile(output);
    requireThat(
      prepared.length <= MAX_VIDEO_BYTES,
      "invalid_video",
      "Prepared video exceeds the upload limit.",
    );
    return { bytes: prepared, durationSeconds: duration };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
