import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export type MediaStore = {
  put(key: string, bytes: Uint8Array, sha256: string): Promise<void>;
  url(key: string, download: boolean): Promise<string>;
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
  return {
    async put(key, bytes, sha256) {
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
