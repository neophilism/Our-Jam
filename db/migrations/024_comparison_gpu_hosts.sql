-- Modal and Lightning are compute locations, not new music providers.
-- Snapshot the selected location in each newly prepared run's settings_snapshot.
ALTER TABLE comparison_admin_settings
  ADD COLUMN IF NOT EXISTS gpu_host text NOT NULL DEFAULT 'modal'
  CHECK (gpu_host IN ('modal','lightning'));
