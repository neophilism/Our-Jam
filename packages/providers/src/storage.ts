import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export type MediaStore = {
  put(key: string, bytes: Uint8Array, sha256: string): Promise<void>;
  url(key: string, download: boolean): Promise<string>;
  verifyRoundTrip?(): Promise<void>;
};
export function s3Store(config: {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): MediaStore {
  if (config.endpoint && new URL(config.endpoint).protocol !== "https:")
    throw new Error("Media storage requires HTTPS.");
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    maxAttempts: 3,
  });
  const put: MediaStore["put"] = async (key, bytes, sha256) => {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: "audio/mpeg",
          Metadata: { sha256 },
          ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64"),
        }),
      );
      const head = await client.send(
        new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      if (
        head.ContentLength !== bytes.length ||
        head.Metadata?.sha256 !== sha256
      )
        throw new Error("Stored media verification failed.");
    };
  return {
    put,
    async verifyRoundTrip() {
      const key = `diagnostics/our-jam/${randomUUID()}.bin`;
      const expected = randomBytes(2048);
      const sha = createHash("sha256").update(expected).digest("hex");
      let stored = false;
      try {
        await put(key, expected, sha);
        stored = true;
        const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        const actual = await response.Body?.transformToByteArray();
        if (!actual || !Buffer.from(actual).equals(expected))
          throw new Error("Private media round-trip returned unexpected bytes.");
      } finally {
        // Delete even when a PUT succeeded but its HEAD verification failed.
        // Do not remove anything outside this randomly generated diagnostic key.
        try {
          await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
        } catch (error) {
          if (stored) throw error;
        }
      }
    },
    async url(key, download) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ResponseContentType: "audio/mpeg",
          ResponseContentDisposition: download
            ? 'attachment; filename="our-jam-track.mp3"'
            : "inline",
        }),
        { expiresIn: 300 },
      );
    },
  };
}
