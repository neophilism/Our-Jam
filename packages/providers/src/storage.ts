import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export type MediaContentType = "audio/mpeg" | "video/mp4";
export type MediaStore = {
  put(key: string, bytes: Uint8Array, sha256: string, contentType?: MediaContentType): Promise<void>;
  url(key: string, download: boolean, contentType?: MediaContentType): Promise<string>;
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
  const put: MediaStore["put"] = async (key, bytes, sha256, contentType = "audio/mpeg") => {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
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
        if (response.ContentLength !== expected.byteLength)
          throw new Error("Private media S3 download declared an unexpected size.");
        const actual = await response.Body?.transformToByteArray();
        if (!actual || !Buffer.from(actual).equals(expected))
          throw new Error("Private media S3 round-trip returned unexpected bytes.");

        // Exercise the same five-minute signed GET URL used by the artist
        // playback redirect; S3 SDK GET alone cannot certify browser delivery.
        const signed = new URL(await this.url(key, false));
        if (signed.protocol !== "https:" ||
            (config.endpoint && signed.host !== new URL(config.endpoint).host))
          throw new Error("Private media download URL left its approved HTTPS host.");
        const authorized = await fetch(signed, {
          redirect: "error", signal: AbortSignal.timeout(30000),
        });
        if (!authorized.ok || Number(authorized.headers.get("content-length") || 0) > 8192)
          throw new Error("Signed private media download failed validation.");
        const signedBytes = Buffer.from(await authorized.arrayBuffer());
        if (!signedBytes.equals(expected))
          throw new Error("Signed private media download returned unexpected bytes.");

        // A private bucket must deny the same object without the signature.
        // Never log the signed URL, token, signature or returned bytes.
        signed.search = "";
        const unsigned = await fetch(signed, {
          redirect: "error", signal: AbortSignal.timeout(20000),
        });
        if (unsigned.ok)
          throw new Error("Private media object was anonymously readable.");
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
    async url(key, download, contentType = "audio/mpeg") {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ResponseContentType: contentType,
          ResponseContentDisposition: download
            ? `attachment; filename="${contentType === "video/mp4" ? "our-jam-sponsor.mp4" : "our-jam-track.mp3"}"`
            : "inline",
        }),
        { expiresIn: 300 },
      );
    },
  };
}
