ALTER TABLE source_tracks ADD COLUMN duration_verified boolean NOT NULL DEFAULT false;
UPDATE source_tracks SET duration_verified=true WHERE audio_url LIKE '%/api/operator/sources/%/audio/%';
CREATE TABLE commerce_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), revision integer NOT NULL DEFAULT 0,
 currency text NOT NULL DEFAULT 'usd', prices jsonb NOT NULL DEFAULT '{"platform":0,"ad_free":0,"own_sponsors":0}',
 break_seconds integer NOT NULL DEFAULT 15 CHECK(break_seconds BETWEEN 0 AND 120),
 slot_seconds integer NOT NULL DEFAULT 5 CHECK(slot_seconds BETWEEN 1 AND 60), platform_video_ids jsonb NOT NULL DEFAULT '[]'
);
INSERT INTO commerce_settings(singleton) VALUES(true);
CREATE TABLE platform_admin_sessions (token_hash text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE TABLE artist_access_keys (token_hash text PRIMARY KEY, artist_id text NOT NULL REFERENCES artists(id), revoked boolean NOT NULL DEFAULT false);
CREATE TABLE sponsor_videos (
 id uuid PRIMARY KEY, owner_artist_id text REFERENCES artists(id), sponsor_name text NOT NULL,
 object_key text NOT NULL UNIQUE, sha256 text NOT NULL, duration_seconds numeric NOT NULL CHECK(duration_seconds>0 AND duration_seconds<=60),
 active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE event_commerce (
 event_id uuid PRIMARY KEY REFERENCES events(id), tier text NOT NULL DEFAULT 'platform' CHECK(tier IN ('platform','ad_free','own_sponsors')),
 own_video_ids jsonb NOT NULL DEFAULT '[]', revision integer NOT NULL DEFAULT 0
);
CREATE TABLE event_purchases (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES events(id), artist_id text NOT NULL REFERENCES artists(id),
 command_id uuid NOT NULL, quote_hash text NOT NULL, tier text NOT NULL CHECK(tier IN ('platform','ad_free','own_sponsors')),
 setlist_seconds integer NOT NULL CHECK(setlist_seconds>0), amount_cents integer NOT NULL CHECK(amount_cents>0), required_paid_cents integer NOT NULL CHECK(required_paid_cents>0), currency text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','paid','expired','revoked')),
 session_id text UNIQUE, checkout_url text, payment_intent text UNIQUE, expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz, UNIQUE(artist_id,command_id)
);
CREATE UNIQUE INDEX event_checkout_pending ON event_purchases(event_id) WHERE state='pending';
CREATE TABLE payment_receipts (provider_event_id text PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE payment_intent_states (payment_intent text PRIMARY KEY, revoked boolean NOT NULL DEFAULT false);
