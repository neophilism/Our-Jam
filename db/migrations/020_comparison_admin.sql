-- Comparison-lab settings are isolated from artist shows, payment, native clients and voting.
CREATE TABLE IF NOT EXISTS comparison_admin_settings (
  id integer PRIMARY KEY CHECK (id=1),
  selected_providers text[] NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(selected_providers) BETWEEN 1 AND 6),
  CHECK (selected_providers <@ ARRAY['mureka','stability','ace_step','heartmula','stable_audio_open','musicgen']::text[])
);
INSERT INTO comparison_admin_settings(id, selected_providers) VALUES(1, ARRAY['mureka','stability']::text[]) ON CONFLICT (id) DO NOTHING;
