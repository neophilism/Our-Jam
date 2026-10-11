ALTER TABLE generation_jobs ADD COLUMN release_held boolean NOT NULL DEFAULT false;
ALTER TABLE generation_jobs ADD COLUMN release_mode text NOT NULL DEFAULT 'boundary' CHECK(release_mode IN ('boundary','immediate','review'));
ALTER TABLE generation_jobs DROP CONSTRAINT generation_jobs_state_check;
ALTER TABLE generation_jobs ADD CONSTRAINT generation_jobs_state_check CHECK(state IN ('blocked','queued','submitting','ready','published','failed','unknown','cancelled'));
