-- Append-only rate history. Rate cards are operator-supplied estimates, NOT provider invoices.
CREATE TABLE IF NOT EXISTS comparison_rate_cards (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK(provider IN ('mureka','stability','ace_step','heartmula','stable_audio_open','musicgen')),
  sku text NOT NULL DEFAULT '',
  unit text NOT NULL CHECK(unit IN ('api_generation','gpu_hour','storage_gib_month','egress_gib')),
  rate_micro_usd bigint NOT NULL CHECK(rate_micro_usd>0),
  supplier text NOT NULL CHECK(length(supplier) BETWEEN 2 AND 100),
  source_description text NOT NULL CHECK(length(source_description) BETWEEN 3 AND 500),
  provenance text NOT NULL DEFAULT 'operator_estimate' CHECK(provenance='operator_estimate'),
  effective_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS comparison_rate_current
 ON comparison_rate_cards(provider,sku,unit) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS comparison_rate_history
 ON comparison_rate_cards(provider,unit,created_at DESC);
