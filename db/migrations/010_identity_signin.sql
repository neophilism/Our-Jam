CREATE TABLE app_identities (
 id uuid PRIMARY KEY, issuer text NOT NULL, subject text NOT NULL,
 participant_id uuid UNIQUE REFERENCES participants(id), artist_id text UNIQUE REFERENCES artists(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(issuer,subject)
);
ALTER TABLE sessions ADD COLUMN identity_id uuid REFERENCES app_identities(id);
CREATE INDEX sessions_identity ON sessions(identity_id);
