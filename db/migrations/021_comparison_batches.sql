-- Prepared comparisons do not start provider calls or allocate GPU usage.
-- No foreign key to live events or generation_jobs: a lab experiment cannot mutate show state.
CREATE TABLE IF NOT EXISTS comparison_batches (
  id uuid PRIMARY KEY,
  command_id uuid NOT NULL UNIQUE,
  prompt text NOT NULL CHECK(length(prompt) BETWEEN 8 AND 3500),
  prompt_sha256 text NOT NULL CHECK(length(prompt_sha256)=64),
  duration_seconds integer NOT NULL CHECK(duration_seconds BETWEEN 10 AND 180),
  instrumental boolean NOT NULL DEFAULT true CHECK(instrumental),
  purpose text NOT NULL CHECK(purpose IN ('private_research','commercial_evaluation')),
  selected_providers text[] NOT NULL,
  selection_revision integer NOT NULL CHECK(selection_revision>=0),
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','queued','running','complete','partial','failed','cancelled')),
  approved_ceiling_micro_usd bigint CHECK(approved_ceiling_micro_usd IS NULL OR approved_ceiling_micro_usd>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(cardinality(selected_providers) BETWEEN 1 AND 6)
);
CREATE INDEX IF NOT EXISTS comparison_batches_latest ON comparison_batches(created_at DESC);
CREATE TABLE IF NOT EXISTS comparison_runs (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES comparison_batches(id),
  provider text NOT NULL CHECK(provider IN ('mureka','stability','ace_step','heartmula','stable_audio_open','musicgen')),
  checkpoint text NOT NULL,
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','blocked','queued','running','succeeded','failed','unknown','cancelled')),
  reason text,
  attempt_id uuid,
  provider_ref text,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  lease_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  generated_duration_seconds numeric CHECK(generated_duration_seconds IS NULL OR generated_duration_seconds>0),
  asset_key text,
  asset_sha256 text CHECK(asset_sha256 IS NULL OR length(asset_sha256)=64),
  estimated_cost_micro_usd bigint CHECK(estimated_cost_micro_usd IS NULL OR estimated_cost_micro_usd>=0),
  actual_cost_micro_usd bigint CHECK(actual_cost_micro_usd IS NULL OR actual_cost_micro_usd>=0),
  cost_certainty text NOT NULL DEFAULT 'unknown' CHECK(cost_certainty IN ('unknown','estimated','invoiced','reconciled')),
  settings_snapshot jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(batch_id,provider)
);
CREATE INDEX IF NOT EXISTS comparison_runs_by_state ON comparison_runs(state,created_at);
CREATE TABLE IF NOT EXISTS comparison_reviews (
  run_id uuid PRIMARY KEY REFERENCES comparison_runs(id),
  sound_quality smallint CHECK(sound_quality BETWEEN 1 AND 5),
  prompt_adherence smallint CHECK(prompt_adherence BETWEEN 1 AND 5),
  approved_usable boolean,
  favorite boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comparison_usage_events (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES comparison_runs(id),
  external_event_id text,
  category text NOT NULL CHECK(category IN ('api','gpu','storage','egress','overhead','adjustment')),
  quantity numeric NOT NULL CHECK(quantity>=0),
  unit text NOT NULL,
  unit_rate_micro_usd bigint CHECK(unit_rate_micro_usd IS NULL OR unit_rate_micro_usd>=0),
  amount_micro_usd bigint CHECK(amount_micro_usd IS NULL OR amount_micro_usd>=0),
  certainty text NOT NULL CHECK(certainty IN ('unknown','estimated','invoiced','reconciled')),
  source text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK((certainty='unknown') = (amount_micro_usd IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS comparison_usage_source_id ON comparison_usage_events(source,external_event_id) WHERE external_event_id IS NOT NULL;
