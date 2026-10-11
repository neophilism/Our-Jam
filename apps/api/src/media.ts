import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const exec = promisify(execFile);
export async function validateAudio(bytes: Uint8Array, expected: number) {
  if (bytes.length < 1000 || bytes.length > 32 * 1024 * 1024)
    throw new Error("Invalid audio size.");
  const dir = await mkdtemp(path.join(tmpdir(), "our-jam-media-"));
  const file = path.join(dir, "source.mp3");
  try {
    await writeFile(file, bytes, { mode: 0o600 });
    const { stdout } = await exec(
      process.env.FFPROBE_PATH ?? "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-f",
        "mp3",
        "-show_entries",
        "format=duration:stream=codec_type,sample_rate,channels",
        "-of",
        "json",
        file,
      ],
      { timeout: 30000, maxBuffer: 65536 },
    );
    const info = JSON.parse(stdout);
    const duration = Number(info.format?.duration);
    if (
      !Number.isFinite(duration) ||
      duration < Math.max(5, expected * 0.8) ||
      duration > expected + 5 ||
      info.streams?.length !== 1 ||
      info.streams[0].codec_type !== "audio" ||
      info.streams[0].channels > 2
    )
      throw new Error("Audio duration or streams failed validation.");
    const { stderr } = await exec(
      process.env.FFMPEG_PATH ?? "ffmpeg",
      [
        "-hide_banner",
        "-nostdin",
        "-protocol_whitelist",
        "file,pipe",
        "-f",
        "mp3",
        "-i",
        file,
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
      ],
      { timeout: 45000, maxBuffer: 262144 },
    );
    const match = stderr.match(/mean_volume: ([-\d.]+) dB/);
    if (!match || Number(match[1]) < -75)
      throw new Error("Audio is silent or undecodable.");
    return { durationSeconds: duration, meanDb: Number(match[1]) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
