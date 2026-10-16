CREATE TABLE native_identity_handoffs (
 id uuid PRIMARY KEY, initiating_token_hash text NOT NULL, challenge text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
 participant_id uuid REFERENCES participants(id), identity_id uuid REFERENCES app_identities(id),
 code_hash text UNIQUE, consumed_at timestamptz
);
CREATE INDEX native_handoff_expiry ON native_identity_handoffs(expires_at);
