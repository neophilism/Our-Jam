import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { Webhook } from "svix";
import type { Database, Sql } from "./db.js";
import { digest, requireThat } from "../../../packages/domain/src/index.js";
import { ownedEvent } from "./service.js";
import {
  emailHash,
  seal,
  unseal,
  MailFailure,
  type EmailConfig,
  type Mail,
} from "./email-config.js";

export const subscriptionInput = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.trim().toLowerCase()),
  consent: z.literal(true),
});
export const emailTokenInput = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
type Contact = { email: string; unsubscribeToken: string };
// Short DB-only serialization covers subscription changes, fanout, dispatch cap
// reservations and webhook suppression. No provider request holds this lock.
const lock = (tx: Sql) =>
  tx.query("SELECT id FROM email_dispatch_control WHERE id=1 FOR UPDATE");
async function cancel(tx: Sql, subscriptionId: string) {
  await tx.query(
    "UPDATE email_jobs SET state=CASE WHEN state IN ('pending','sending') THEN 'cancelled' ELSE state END,payload_ciphertext=NULL WHERE subscription_id=$1",
    [subscriptionId],
  );
}
async function enqueue(
  tx: Sql,
  config: EmailConfig,
  subscription: any,
  kind: "verify" | "release",
  mail: Mail,
  releaseId?: string,
) {
  const id = randomUUID();
  await tx.query(
    "INSERT INTO email_jobs(id,event_id,subscription_id,email_hash,kind,release_id,payload_ciphertext) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
    [
      id,
      subscription.event_id,
      subscription.id,
      subscription.email_hash,
      kind,
      releaseId ?? null,
      seal(config, mail, "job:" + id),
    ],
  );
}
export async function subscriptionStatus(
  db: Database,
  eventId: string,
  participantId: string,
) {
  const row = (
    await db.query(
      "SELECT state,verify_expires_at,verified_at FROM email_subscriptions WHERE event_id=$1 AND participant_id=$2",
      [eventId, participantId],
    )
  ).rows[0];
  return {
    state: row?.state ?? "none",
    verificationExpiresAt: row?.verify_expires_at ?? null,
  };
}
export async function subscribe(
  db: Database,
  config: EmailConfig,
  eventId: string,
  participantId: string,
  input: z.infer<typeof subscriptionInput>,
) {
  return db.transaction(async (tx) => {
    await lock(tx);
    const event = (
      await tx.query(
        "SELECT e.* FROM events e JOIN event_members m ON m.event_id=e.id WHERE e.id=$1 AND m.participant_id=$2",
        [eventId, participantId],
      )
    ).rows[0];
    requireThat(
      event,
      "join_required",
      "Join this event before choosing release emails.",
      403,
    );
    const existing = (
      await tx.query(
        "SELECT * FROM email_subscriptions WHERE event_id=$1 AND participant_id=$2",
        [eventId, participantId],
      )
    ).rows[0];
    const hash = emailHash(config, input.email);
    if (existing?.email_hash === hash && existing.state === "verified")
      return { state: "verified" };
    // The same neutral response is used for throttled and suppressed addresses.
    // The caller never learns whether somebody else's address has subscribed.
    const suppressed = (
      await tx.query("SELECT 1 FROM email_suppressions WHERE email_hash=$1", [
        hash,
      ])
    ).rows.length;
    const recent = (
      await tx.query(
        "SELECT count(*)::int total,count(*) FILTER(WHERE created_at>now()-interval '1 hour')::int recent FROM email_jobs WHERE kind='verify' AND email_hash=$1 AND created_at>now()-interval '1 day'",
        [hash],
      )
    ).rows[0];
    if (suppressed || recent.recent || recent.total >= 3)
      return { state: "requested" };
    const id = existing?.id ?? randomUUID(),
      verifyToken = randomBytes(32).toString("hex"),
      unsubscribeToken = randomBytes(32).toString("hex");
    if (existing) await cancel(tx, id);
    await tx.query(
      "INSERT INTO email_subscriptions(id,event_id,participant_id,email_hash,contact_ciphertext,state,verify_hash,verify_expires_at,unsubscribe_hash) VALUES($1,$2,$3,$4,$5,'pending',$6,now()+interval '1 hour',$7) ON CONFLICT(event_id,participant_id) DO UPDATE SET email_hash=EXCLUDED.email_hash,contact_ciphertext=EXCLUDED.contact_ciphertext,state='pending',verify_hash=EXCLUDED.verify_hash,verify_expires_at=EXCLUDED.verify_expires_at,unsubscribe_hash=EXCLUDED.unsubscribe_hash,consent_at=now(),verified_at=NULL",
      [
        id,
        eventId,
        participantId,
        hash,
        seal(config, { email: input.email, unsubscribeToken }, "contact:" + id),
        digest(verifyToken),
        digest(unsubscribeToken),
      ],
    );
    const base = `${config.origin}/email/`;
    await enqueue(
      tx,
      config,
      { id, event_id: eventId, email_hash: hash },
      "verify",
      {
        from: config.from,
        to: [input.email],
        subject: "Confirm your Our Jam release emails",
        text: `Someone requested free-release emails for ${event.title} on Our Jam.\n\nIf that was you, open this link and confirm within one hour:\n${base}verify#${verifyToken}\n\nThis subscribes you only to this event's future music releases, not artist marketing. Listening and downloading never require email.\n\nIf this wasn't you, ignore this message or stop this event's emails:\n${base}unsubscribe#${unsubscribeToken}`,
      },
    );
    return { state: "requested" };
  });
}
export async function verifyEmail(db: Database, token: string) {
  return db.transaction(async (tx) => {
    await lock(tx);
    const s = (
      await tx.query(
        "SELECT s.*,e.slug FROM email_subscriptions s JOIN events e ON e.id=s.event_id WHERE s.verify_hash=$1 AND s.verify_expires_at>now() AND s.state='pending'",
        [digest(token)],
      )
    ).rows[0];
    requireThat(
      s,
      "invalid_confirmation",
      "This confirmation expired or was already used. Return to the event to request another.",
      400,
    );
    requireThat(
      !(
        await tx.query("SELECT 1 FROM email_suppressions WHERE email_hash=$1", [
          s.email_hash,
        ])
      ).rows.length,
      "email_suppressed",
      "Email delivery is unavailable for this address.",
      409,
    );
    await tx.query(
      "UPDATE email_subscriptions SET state='verified',verified_at=clock_timestamp(),verify_hash=NULL,verify_expires_at=NULL WHERE id=$1",
      [s.id],
    );
    await cancel(tx, s.id);
    return { state: "verified", slug: s.slug };
  });
}
export async function unsubscribeEmail(
  db: Database,
  input: { token: string } | { eventId: string; participantId: string },
) {
  return db.transaction(async (tx) => {
    await lock(tx);
    let rows: any[];
    if ("token" in input) {
      const source = (
        await tx.query(
          "SELECT event_id,email_hash FROM email_subscriptions WHERE unsubscribe_hash=$1",
          [digest(input.token)],
        )
      ).rows[0];
      rows = source
        ? (
            await tx.query(
              "SELECT id FROM email_subscriptions WHERE event_id=$1 AND email_hash=$2",
              [source.event_id, source.email_hash],
            )
          ).rows
        : [];
    } else
      rows = (
        await tx.query(
          "SELECT id FROM email_subscriptions WHERE event_id=$1 AND participant_id=$2",
          [input.eventId, input.participantId],
        )
      ).rows;
    for (const s of rows) {
      await tx.query(
        "UPDATE email_subscriptions SET state='unsubscribed',contact_ciphertext=NULL,verify_hash=NULL,verify_expires_at=NULL WHERE id=$1",
        [s.id],
      );
      await cancel(tx, s.id);
    }
    return { state: "unsubscribed" };
  });
}
export async function fanoutEmail(db: Database, config: EmailConfig) {
  return db.transaction(async (tx) => {
    await lock(tx);
    const release = (
      await tx.query(
        "SELECT r.*,e.slug,e.title event_title FROM releases r JOIN events e ON e.id=r.event_id LEFT JOIN email_release_fanout f ON f.release_id=r.id WHERE r.published_at IS NOT NULL AND f.release_id IS NULL ORDER BY r.published_at DESC,r.id LIMIT 1",
      )
    ).rows[0];
    if (!release) return;
    if (!release.hidden) {
      const subscribers = (
        await tx.query(
          "SELECT * FROM email_subscriptions s WHERE event_id=$1 AND state='verified' AND verified_at<=$2 AND NOT EXISTS(SELECT 1 FROM email_suppressions x WHERE x.email_hash=s.email_hash)",
          [release.event_id, release.published_at],
        )
      ).rows;
      for (const s of subscribers) {
        const contact = unseal<Contact>(
          config,
          s.contact_ciphertext,
          "contact:" + s.id,
        );
        await enqueue(
          tx,
          config,
          s,
          "release",
          {
            from: config.from,
            to: [contact.email],
            subject: "A new track from your Our Jam session",
            text: `${release.title} from ${release.event_title} is ready.\n\nListen, leave your reaction and download the free track:\n${config.origin}/event/${encodeURIComponent(release.slug)}?track=${release.id}\n\nStop this event's release emails:\n${config.origin}/email/unsubscribe#${contact.unsubscribeToken}`,
          },
          release.id,
        );
      }
    }
    await tx.query("INSERT INTO email_release_fanout(release_id) VALUES($1)", [
      release.id,
    ]);
  });
}
export async function emailTick(db: Database, config: EmailConfig) {
  await fanoutEmail(db, config);
  const claimed = await db.transaction(async (tx) => {
    await lock(tx);
    // Expired leases can retry only within the provider's 24-hour idempotency window.
    await tx.query(
      "UPDATE email_jobs SET state='pending',lease_until=NULL WHERE state='sending' AND lease_until<now()",
    );
    await tx.query(
      "UPDATE email_jobs SET state='unknown',reason='retry_window_expired',payload_ciphertext=NULL WHERE state='pending' AND first_attempt_at<now()-interval '23 hours'",
    );
    await tx.query(
      "UPDATE email_jobs j SET state='cancelled',reason='no_longer_eligible',payload_ciphertext=NULL FROM email_subscriptions s WHERE s.id=j.subscription_id AND j.state='pending' AND (s.state IN ('unsubscribed','suppressed') OR (j.kind='verify' AND (s.state<>'pending' OR s.verify_expires_at<=now())) OR (j.kind='release' AND EXISTS(SELECT 1 FROM releases r WHERE r.id=j.release_id AND r.hidden)))",
    );
    // Clear expired unverified contacts without retaining addresses indefinitely.
    await tx.query(
      "UPDATE email_subscriptions SET state='unsubscribed',contact_ciphertext=NULL,verify_hash=NULL WHERE state='pending' AND verify_expires_at<now()-interval '1 day'",
    );
    const ready = (
      await tx.query(
        "SELECT next_send_at<=now() ready FROM email_dispatch_control WHERE id=1",
      )
    ).rows[0].ready;
    if (!ready) return;
    const j = (
      await tx.query(
        "SELECT * FROM email_jobs WHERE state='pending' AND next_attempt_at<=now() AND payload_ciphertext IS NOT NULL ORDER BY created_at,id LIMIT 1",
      )
    ).rows[0];
    if (!j) return;
    if (!j.first_attempt_at) {
      const count = (
        await tx.query(
          "SELECT count(*)::int n FROM email_jobs WHERE first_attempt_at>now()-interval '1 day'",
        )
      ).rows[0].n;
      if (count >= config.maxPerDay) return;
    }
    const attempt = randomUUID();
    await tx.query(
      "UPDATE email_jobs SET state='sending',attempts=attempts+1,attempt_id=$1,lease_until=now()+interval '1 minute',first_attempt_at=COALESCE(first_attempt_at,now()) WHERE id=$2",
      [attempt, j.id],
    );
    await tx.query(
      "UPDATE email_dispatch_control SET next_send_at=now()+interval '1 second' WHERE id=1",
    );
    return {
      id: j.id as string,
      payload_ciphertext: j.payload_ciphertext as string,
      attempt,
      attempts: Number(j.attempts) + 1,
    };
  });
  if (!claimed) return;
  try {
    const mail = unseal<Mail>(
      config,
      claimed.payload_ciphertext,
      "job:" + claimed.id,
    );
    const providerId = await config.send(mail, "ourjam-email/" + claimed.id);
    await db.query(
      "UPDATE email_jobs SET state='accepted',provider_id=$1,payload_ciphertext=NULL,lease_until=NULL,reason=NULL WHERE id=$2 AND attempt_id=$3 AND state='sending'",
      [providerId, claimed.id, claimed.attempt],
    );
  } catch (error) {
    const permanent = error instanceof MailFailure && !error.retryable;
    const state = permanent
      ? "failed"
      : claimed.attempts >= 6
        ? "unknown"
        : "pending";
    await db.query(
      "UPDATE email_jobs SET state=$1,reason=$2,lease_until=NULL,next_attempt_at=now()+($3::int * interval '1 second'),payload_ciphertext=CASE WHEN $1='pending' THEN payload_ciphertext ELSE NULL END WHERE id=$4 AND attempt_id=$5 AND state='sending'",
      [
        state,
        permanent ? "provider_rejected" : "provider_uncertain",
        Math.min(900, 30 * 2 ** claimed.attempts),
        claimed.id,
        claimed.attempt,
      ],
    );
  }
}
export async function emailWebhook(
  db: Database,
  config: EmailConfig,
  body: string,
  headers: Record<string, string>,
) {
  let value: unknown;
  try {
    new Webhook(config.webhookSecret).verify(body, headers);
    value = JSON.parse(body);
  } catch {
    requireThat(
      false,
      "invalid_webhook",
      "Invalid email webhook signature.",
      400,
    );
  }
  const event = z
    .object({
      type: z.string().max(100),
      data: z
        .object({
          email_id: z.string().max(200),
          to: z.array(z.email()).max(50),
        })
        .passthrough(),
    })
    .parse(value);
  return db.transaction(async (tx) => {
    await lock(tx);
    const receipt = await tx.query(
      "INSERT INTO email_webhook_receipts(id,type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id",
      [headers["svix-id"], event.type],
    );
    if (!receipt.rows.length) return { ok: true };
    const bad = [
      "email.bounced",
      "email.complained",
      "email.suppressed",
    ].includes(event.type);
    if (bad)
      for (const address of event.data.to) {
        const hash = emailHash(config, address);
        const rows = (
          await tx.query(
            "SELECT id FROM email_subscriptions WHERE email_hash=$1",
            [hash],
          )
        ).rows;
        if (!rows.length) continue;
        await tx.query(
          "INSERT INTO email_suppressions(email_hash,reason) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [hash, event.type],
        );
        for (const s of rows) {
          await tx.query(
            "UPDATE email_subscriptions SET state='suppressed',contact_ciphertext=NULL,verify_hash=NULL,verify_expires_at=NULL WHERE id=$1",
            [s.id],
          );
          await cancel(tx, s.id);
        }
      }
    if (bad || event.type === "email.delivered")
      await tx.query(
        "UPDATE email_jobs SET delivery_state=$1 WHERE provider_id=$2 AND (delivery_state IS NULL OR delivery_state='email.delivered')",
        [event.type, event.data.email_id],
      );
    return { ok: true };
  });
}
export async function emailStats(
  db: Database,
  artistId: string,
  eventId: string,
) {
  await ownedEvent(db, eventId, artistId);
  return {
    subscriptions: (
      await db.query(
        "SELECT state,count(*)::int count FROM email_subscriptions WHERE event_id=$1 GROUP BY state",
        [eventId],
      )
    ).rows,
    deliveries: (
      await db.query(
        "SELECT state,count(*)::int count FROM email_jobs WHERE event_id=$1 GROUP BY state",
        [eventId],
      )
    ).rows,
  };
}
