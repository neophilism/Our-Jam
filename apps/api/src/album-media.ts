import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateAudio } from "./media.js";
import { requireThat } from "../../../packages/domain/src/index.js";
const exec = promisify(execFile);
export const MAX_ALBUM_UPLOAD_BYTES = 128 * 1024 * 1024;
export type AlbumMedia = { bytes: Uint8Array; durationSeconds: number };
/** Decode only MP3/WAV bytes; never allow playlists, remote URLs or video input. */
export async function prepareAlbumAudio(bytes: Uint8Array): Promise<AlbumMedia> {
  requireThat(bytes.length >= 128 && bytes.length <= MAX_ALBUM_UPLOAD_BYTES, "invalid_album_audio", "Choose an MP3 or WAV file no larger than 128 MiB.");
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const wav = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
  const mp3 = buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer[0] === 255 && (buffer[1] & 0xe0) === 0xe0);
  requireThat(wav || mp3, "invalid_album_audio", "This file is not a supported MP3 or WAV recording.");
  const dir = await mkdtemp(path.join(tmpdir(), "our-jam-album-"));
  const input = path.join(dir, wav ? "input.wav" : "input.mp3"), output = path.join(dir, "playback.mp3");
  try {
    await writeFile(input, bytes, { mode: 0o600 });
    const { stdout } = await exec(process.env.FFPROBE_PATH ?? "ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-f", wav ? "wav" : "mp3", "-show_entries", "format=duration:stream=codec_type,channels", "-of", "json", input], { timeout: 30000, maxBuffer: 65536 });
    const info = JSON.parse(stdout), duration = Number(info.format?.duration);
    requireThat(Number.isFinite(duration) && duration >= 5 && duration <= 600 && info.streams?.length === 1 && info.streams[0].codec_type === "audio" && info.streams[0].channels <= 2, "invalid_album_audio", "Use a mono or stereo song between five seconds and ten minutes, without an embedded video stream.");
    await exec(process.env.FFMPEG_PATH ?? "ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-f", wav ? "wav" : "mp3", "-i", input, "-map", "0:a:0", "-map_metadata", "-1", "-vn", "-codec:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", "-f", "mp3", output], { timeout: 120000, maxBuffer: 65536 });
    const prepared = await readFile(output);
    const validated = await validateAudio(prepared, duration);
    return { bytes: prepared, durationSeconds: validated.durationSeconds };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
