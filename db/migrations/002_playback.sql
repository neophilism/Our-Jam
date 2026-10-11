ALTER TABLE rounds DROP CONSTRAINT rounds_state_check;
ALTER TABLE rounds ADD CONSTRAINT rounds_state_check CHECK(state IN ('open','paused','closed','cancelled'));
ALTER TABLE rounds ADD COLUMN paused_at timestamptz;
ALTER TABLE rounds ADD COLUMN remaining_ms integer;
ALTER TABLE rounds ADD COLUMN paused_ms bigint NOT NULL DEFAULT 0;
ALTER TABLE rounds ADD COLUMN pause_reason text;
DROP INDEX one_open_round;
CREATE UNIQUE INDEX one_active_round ON rounds(event_id) WHERE state IN ('open','paused');
CREATE TABLE playback_leases (
 event_id uuid PRIMARY KEY REFERENCES events(id), holder_hash text NOT NULL, epoch integer NOT NULL DEFAULT 1,
 last_sequence integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
