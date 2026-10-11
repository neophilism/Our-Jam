CREATE TABLE email_subscriptions (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES events(id), participant_id uuid NOT NULL REFERENCES participants(id),
 email_hash text NOT NULL, contact_ciphertext text,
 state text NOT NULL CHECK(state IN ('pending','verified','unsubscribed','suppressed')),
 verify_hash text UNIQUE, verify_expires_at timestamptz, unsubscribe_hash text NOT NULL UNIQUE,
 consent_at timestamptz NOT NULL DEFAULT now(), consent_version text NOT NULL DEFAULT 'event-releases-v1', verified_at timestamptz,
 UNIQUE(event_id,participant_id), UNIQUE(event_id,id)
);
CREATE TABLE email_suppressions (
 email_hash text PRIMARY KEY, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE email_jobs (
 id uuid PRIMARY KEY, event_id uuid NOT NULL, subscription_id uuid NOT NULL, release_id uuid, email_hash text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('verify','release')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','failed','unknown','cancelled')),
 payload_ciphertext text, provider_id text UNIQUE, delivery_state text, reason text,
 attempts integer NOT NULL DEFAULT 0, attempt_id uuid, lease_until timestamptz, first_attempt_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(event_id,subscription_id) REFERENCES email_subscriptions(event_id,id),
 FOREIGN KEY(event_id,release_id) REFERENCES releases(event_id,id),
 CHECK((kind='release')=(release_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_release_email ON email_jobs(release_id,email_hash) WHERE kind='release';
CREATE INDEX email_jobs_pending ON email_jobs(next_attempt_at) WHERE state IN ('pending','sending');
CREATE INDEX email_verification_throttle ON email_jobs(email_hash,created_at) WHERE kind='verify';
CREATE TABLE email_release_fanout (
 release_id uuid PRIMARY KEY REFERENCES releases(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE email_webhook_receipts (
 id text PRIMARY KEY, type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE email_dispatch_control (id integer PRIMARY KEY CHECK(id=1), next_send_at timestamptz NOT NULL DEFAULT now());
INSERT INTO email_dispatch_control(id) VALUES(1);
