import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { z } from "zod";
import { requireThat } from "../../../packages/domain/src/index.js";
import type { Database, Sql } from "./db.js";
export const avatarInput = z
  .object({
    png: z.string().max(180000),
    publicUseConsent: z.literal(true),
    expectedRevision: z.number().int().nonnegative().max(2147483646),
  })
  .strict();
export const avatarDeleteInput = z
  .object({ expectedRevision: z.number().int().nonnegative().max(2147483646) })
  .strict();
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc(bytes: Buffer) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++)
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type),
    out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc(Buffer.concat([name, data])), out.length - 4);
  return out;
}
function paeth(a: number, b: number, c: number) {
  const p = a + b - c,
    x = Math.abs(p - a),
    y = Math.abs(p - b),
    z = Math.abs(p - c);
  return x <= y && x <= z ? a : y <= z ? b : c;
}
/** Decode a bounded RGBA PNG and encode only pixels. No source metadata survives. */
export function canonicalAvatar(encoded: string) {
  requireThat(
    typeof encoded === "string" && encoded.length <= 180000,
    "invalid_avatar",
    "Choose a small PNG image.",
  );
  requireThat(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    ),
    "invalid_avatar",
    "Choose a valid image.",
  );
  const bytes = Buffer.from(encoded, "base64");
  requireThat(
    bytes.length >= 45 &&
      bytes.length <= 131072 &&
      bytes.subarray(0, 8).equals(signature),
    "invalid_avatar",
    "Choose a small PNG image.",
  );
  let offset = 8,
    header: Buffer | undefined,
    ended = false,
    sawData = false,
    dataEnded = false;
  const compressed: Buffer[] = [];
  while (offset < bytes.length) {
    requireThat(
      offset + 12 <= bytes.length,
      "invalid_avatar",
      "Incomplete image.",
    );
    const length = bytes.readUInt32BE(offset),
      end = offset + 12 + length;
    requireThat(end <= bytes.length, "invalid_avatar", "Incomplete image.");
    const type = bytes.toString("ascii", offset + 4, offset + 8),
      data = bytes.subarray(offset + 8, end - 4);
    requireThat(
      crc(bytes.subarray(offset + 4, end - 4)) === bytes.readUInt32BE(end - 4),
      "invalid_avatar",
      "Image checksum failed.",
    );
    if (type === "IHDR") {
      requireThat(
        offset === 8 && length === 13 && !header,
        "invalid_avatar",
        "Invalid image header.",
      );
      header = Buffer.from(data);
    } else if (type === "IDAT") {
      requireThat(
        header && !dataEnded,
        "invalid_avatar",
        "Invalid image data order.",
      );
      sawData = true;
      compressed.push(data);
    } else if (type === "IEND") {
      requireThat(
        header && length === 0 && sawData && end === bytes.length,
        "invalid_avatar",
        "Invalid image ending.",
      );
      ended = true;
      break;
    } else {
      requireThat(
        header && /^[a-z][A-Za-z]{3}$/.test(type),
        "invalid_avatar",
        "Unsupported image format.",
      );
      if (sawData) dataEnded = true;
    }
    offset = end;
  }
  requireThat(header && ended, "invalid_avatar", "Incomplete image.");
  const width = header.readUInt32BE(0),
    height = header.readUInt32BE(4),
    stride = width * 4;
  requireThat(
    width >= 1 &&
      width <= 128 &&
      height >= 1 &&
      height <= 128 &&
      header[8] === 8 &&
      header[9] === 6 &&
      header[10] === 0 &&
      header[11] === 0 &&
      header[12] === 0,
    "invalid_avatar",
    "Use an RGBA image up to 128 by 128 pixels.",
  );
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(compressed), {
      maxOutputLength: (stride + 1) * height,
    });
  } catch {
    requireThat(false, "invalid_avatar", "Image data could not be decoded.");
  }
  requireThat(
    raw.length === (stride + 1) * height,
    "invalid_avatar",
    "Image dimensions do not match its pixels.",
  );
  const clean = Buffer.alloc(raw.length);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1),
      filter = raw[start];
    requireThat(filter <= 4, "invalid_avatar", "Unsupported image filter.");
    const row = clean.subarray(start + 1, start + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? row[x - 4] : 0,
        b = previous[x],
        c = x >= 4 ? previous[x - 4] : 0;
      const prediction =
        filter === 0
          ? 0
          : filter === 1
            ? a
            : filter === 2
              ? b
              : filter === 3
                ? Math.floor((a + b) / 2)
                : paeth(a, b, c);
      row[x] = (raw[start + 1 + x] + prediction) & 255;
    }
    previous = row;
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(clean)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
export async function saveAvatar(
  db: Database,
  participantId: string,
  input: z.infer<typeof avatarInput>,
) {
  const png = canonicalAvatar(input.png),
    sha = createHash("sha256").update(png).digest("hex");
  const row = (
    await db.query(
      "UPDATE participants SET avatar_png=$1,avatar_sha=$2,avatar_revision=avatar_revision+1 WHERE id=$3 AND avatar_revision=$4 RETURNING avatar_revision,anonymous",
      [png, sha, participantId, input.expectedRevision],
    )
  ).rows[0];
  requireThat(
    row,
    "revision_conflict",
    "Your profile picture changed. Refresh before saving.",
    409,
  );
  return {
    revision: row.avatar_revision,
    avatarUrl: row.anonymous ? null : "/api/avatars/" + sha,
  };
}
export async function removeAvatar(
  db: Sql,
  participantId: string,
  expectedRevision: number,
) {
  const row = (
    await db.query(
      "UPDATE participants SET avatar_png=NULL,avatar_sha=NULL,avatar_revision=avatar_revision+1 WHERE id=$1 AND avatar_revision=$2 RETURNING avatar_revision",
      [participantId, expectedRevision],
    )
  ).rows[0];
  requireThat(
    row,
    "revision_conflict",
    "Your profile picture changed. Refresh before removing it.",
    409,
  );
  return { revision: row.avatar_revision, avatarUrl: null };
}
