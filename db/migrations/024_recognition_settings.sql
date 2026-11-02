ALTER TABLE artists ADD COLUMN leaderboard_timezone text NOT NULL DEFAULT 'UTC';
ALTER TABLE artists ADD COLUMN leaderboard_visible boolean NOT NULL DEFAULT true;
ALTER TABLE artists ADD COLUMN recognition_revision integer NOT NULL DEFAULT 0 CHECK (recognition_revision >= 0);
ALTER TABLE participants ADD COLUMN avatar_png bytea CHECK (avatar_png IS NULL OR octet_length(avatar_png) <= 131072);
ALTER TABLE participants ADD COLUMN avatar_sha text CHECK (avatar_sha IS NULL OR avatar_sha ~ '^[a-f0-9]{64}$');
ALTER TABLE participants ADD COLUMN avatar_revision integer NOT NULL DEFAULT 0 CHECK (avatar_revision >= 0);
ALTER TABLE participants ADD CONSTRAINT avatar_pair CHECK ((avatar_png IS NULL) = (avatar_sha IS NULL));
CREATE INDEX public_avatar_lookup ON participants(avatar_sha) WHERE NOT anonymous;
