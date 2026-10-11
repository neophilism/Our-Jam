CREATE TABLE participant_recovery (
 participant_id uuid PRIMARY KEY REFERENCES participants(id), key_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz
);
CREATE TABLE artist_follows (
 participant_id uuid REFERENCES participants(id), artist_id text REFERENCES artists(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(participant_id,artist_id)
);
CREATE INDEX artist_followers ON artist_follows(artist_id);
