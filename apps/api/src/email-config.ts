import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

export type Mail = {
  from: string;
  to: string[];
  subject: string;
  text: string;
};
export type EmailConfig = {
  origin: string;
  from: string;
  key: Buffer;
  webhookSecret: string;
  maxPerDay: number;
  send: (mail: Mail, key: string) => Promise<string>;
};
export class MailFailure extends Error {
  constructor(public readonly retryable: boolean) {
    super("email_provider_rejected");
  }
}
export function emailHash(config: EmailConfig, email: string) {
  return createHmac("sha256", config.key)
    .update("address:" + email.trim().toLowerCase())
    .digest("hex");
}
export function seal(config: EmailConfig, value: unknown, purpose: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", config.key, nonce);
  cipher.setAAD(Buffer.from(purpose));
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), bytes]).toString("base64");
}
export function unseal<T>(
  config: EmailConfig,
  value: string,
  purpose: string,
): T {
  const bytes = Buffer.from(value, "base64"),
    cipher = createDecipheriv("aes-256-gcm", config.key, bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(purpose));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      cipher.update(bytes.subarray(28)),
      cipher.final(),
    ]).toString(),
  );
}
export function resendSender(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): EmailConfig["send"] {
  return async (mail, key) => {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(mail),
    });
    if (!response.ok)
      throw new MailFailure(response.status === 429 || response.status >= 500);
    const body = z
      .object({ id: z.string().min(1).max(200) })
      .parse(await response.json());
    return body.id;
  };
}
export function configuredEmail(
  origin: string,
  env = process.env,
): EmailConfig | undefined {
  if (env.EMAIL_ENABLED !== "1") return;
  if (env.EMAIL_DELIVERY_ACK !== "approved-event-email")
    throw new Error(
      "Email delivery needs explicit sender and budget approval.",
    );
  const from = z.email().parse(env.EMAIL_FROM);
  const apiKey = z.string().min(10).parse(env.RESEND_API_KEY);
  const webhookSecret = z
    .string()
    .startsWith("whsec_")
    .min(20)
    .parse(env.RESEND_WEBHOOK_SECRET);
  const rawKey = z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .parse(env.EMAIL_DATA_KEY);
  const maxPerDay = z.coerce
    .number()
    .int()
    .positive()
    .max(100000)
    .parse(env.EMAIL_MAX_SENDS_PER_DAY);
  if (!origin.startsWith("https://") || new URL(origin).origin !== origin)
    throw new Error("Email links require a production HTTPS origin.");
  return {
    origin,
    from,
    key: Buffer.from(rawKey, "hex"),
    webhookSecret,
    maxPerDay,
    send: resendSender(apiKey),
  };
}
