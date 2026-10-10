CREATE TABLE IF NOT EXISTS artists (
 id text PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO artists(id,name) VALUES ('our-jam','Our Jam') ON CONFLICT DO NOTHING;
CREATE TABLE participants (
 id uuid PRIMARY KEY, name text NOT NULL DEFAULT 'Anonymous', anonymous boolean NOT NULL DEFAULT true,
 avatar_seed text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, participant_id uuid REFERENCES participants(id), artist_id text REFERENCES artists(id),
 kind text NOT NULL CHECK(kind IN ('guest','operator')), expires_at timestamptz NOT NULL,
 CHECK((kind='guest' AND participant_id IS NOT NULL AND artist_id IS NULL) OR (kind='operator' AND artist_id IS NOT NULL AND participant_id IS NULL))
);
CREATE TABLE events (
 id uuid PRIMARY KEY, artist_id text NOT NULL REFERENCES artists(id), slug text NOT NULL UNIQUE,
 title text NOT NULL, artist_name text NOT NULL, purchase_url text, state text NOT NULL DEFAULT 'waiting' CHECK(state IN ('waiting','live','ended')),
 settings jsonb NOT NULL, revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE event_members (
 event_id uuid REFERENCES events(id), participant_id uuid REFERENCES participants(id), joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,participant_id)
);
CREATE TABLE source_tracks (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES events(id), title text NOT NULL, core_prompt text NOT NULL,
 audio_url text, duration_seconds integer NOT NULL CHECK(duration_seconds BETWEEN 15 AND 1200), ordinal integer NOT NULL,
 UNIQUE(event_id,id)
);
CREATE TABLE rounds (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES events(id), source_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','closed','cancelled')),
 opened_at timestamptz NOT NULL DEFAULT now(), deadline_at timestamptz NOT NULL, closed_at timestamptz,
 seed text NOT NULL, seed_commitment text NOT NULL, core_prompt text NOT NULL, settings jsonb NOT NULL,
 FOREIGN KEY(event_id,source_id) REFERENCES source_tracks(event_id,id), UNIQUE(event_id,id)
);
CREATE UNIQUE INDEX one_open_round ON rounds(event_id) WHERE state='open';
CREATE TABLE sound_waves (
 id uuid PRIMARY KEY, round_id uuid NOT NULL REFERENCES rounds(id), author_id uuid NOT NULL REFERENCES participants(id),
 text text NOT NULL CHECK(length(text) BETWEEN 2 AND 48), normalized text NOT NULL, moderated boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(round_id,normalized), UNIQUE(round_id,id)
);
CREATE TABLE ballots (
 round_id uuid REFERENCES rounds(id), participant_id uuid REFERENCES participants(id), revision integer NOT NULL DEFAULT 0,
 PRIMARY KEY(round_id,participant_id)
);
CREATE TABLE allocations (
 round_id uuid NOT NULL, participant_id uuid NOT NULL, wave_id uuid NOT NULL,
 points smallint NOT NULL CHECK(points BETWEEN 1 AND 5),
 PRIMARY KEY(round_id,participant_id,wave_id),
 FOREIGN KEY(round_id,participant_id) REFERENCES ballots(round_id,participant_id),
 FOREIGN KEY(round_id,wave_id) REFERENCES sound_waves(round_id,id)
);
CREATE INDEX allocations_wave ON allocations(round_id,wave_id);
CREATE TABLE generation_jobs (
 id uuid PRIMARY KEY, event_id uuid NOT NULL, round_id uuid NOT NULL UNIQUE,
 state text NOT NULL CHECK(state IN ('blocked','queued','submitting','ready','published','failed','unknown')),
 reason text, snapshot jsonb NOT NULL, prompt text NOT NULL, prompt_hash text NOT NULL,
 lease_until timestamptz, attempt_id uuid, provider_ref text, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(event_id,round_id) REFERENCES rounds(event_id,id), UNIQUE(event_id,id)
);
CREATE TABLE releases (
 id uuid PRIMARY KEY, event_id uuid NOT NULL, job_id uuid NOT NULL UNIQUE, title text NOT NULL,
 audio_url text NOT NULL, download_url text NOT NULL, duration_seconds numeric NOT NULL CHECK(duration_seconds>0),
 published_at timestamptz, hidden boolean NOT NULL DEFAULT false,
 FOREIGN KEY(event_id,job_id) REFERENCES generation_jobs(event_id,id), UNIQUE(event_id,id)
);
CREATE TABLE queue_items (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES events(id), source_id uuid, release_id uuid,
 position integer NOT NULL, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','playing','played','removed')),
 FOREIGN KEY(event_id,source_id) REFERENCES source_tracks(event_id,id),
 FOREIGN KEY(event_id,release_id) REFERENCES releases(event_id,id),
 CHECK((source_id IS NOT NULL)::integer+(release_id IS NOT NULL)::integer=1)
);
CREATE UNIQUE INDEX one_playing_item ON queue_items(event_id) WHERE state='playing';
CREATE TABLE reactions (
 release_id uuid REFERENCES releases(id), participant_id uuid REFERENCES participants(id),
 value smallint NOT NULL CHECK(value IN (-1,1)), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(release_id,participant_id)
);
CREATE TABLE comments (
 id uuid PRIMARY KEY, release_id uuid NOT NULL REFERENCES releases(id), participant_id uuid NOT NULL REFERENCES participants(id),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 500), hidden boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reports (
 id uuid PRIMARY KEY, comment_id uuid NOT NULL REFERENCES comments(id), participant_id uuid NOT NULL REFERENCES participants(id),
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(comment_id,participant_id)
);
CREATE TABLE listening (
 release_id uuid REFERENCES releases(id), participant_id uuid REFERENCES participants(id), intervals jsonb NOT NULL DEFAULT '[]',
 seconds numeric NOT NULL DEFAULT 0, qualified boolean NOT NULL DEFAULT false, completed boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(release_id,participant_id)
);
CREATE TABLE idempotency (
 actor_id text NOT NULL, command_id uuid NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,command_id)
);
CREATE TABLE event_log (
 sequence bigserial PRIMARY KEY, event_id uuid NOT NULL REFERENCES events(id), type text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_log_replay ON event_log(event_id,sequence);
CREATE TABLE audit_log (
 id bigserial PRIMARY KEY, artist_id text NOT NULL REFERENCES artists(id), event_id uuid REFERENCES events(id),
 action text NOT NULL, subject_id text, created_at timestamptz NOT NULL DEFAULT now()
);
