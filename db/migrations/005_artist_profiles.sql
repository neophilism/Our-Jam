ALTER TABLE artists ADD COLUMN bio text NOT NULL DEFAULT '' CHECK(length(bio)<=1200);
ALTER TABLE artists ADD COLUMN links jsonb NOT NULL DEFAULT '[]';
ALTER TABLE artists ADD COLUMN profile_revision integer NOT NULL DEFAULT 0;
CREATE INDEX artist_event_archive ON events(artist_id,created_at DESC,id);
CREATE INDEX participant_liked_tracks ON reactions(participant_id,updated_at DESC) WHERE value=1;
