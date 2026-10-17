-- Append-only owner entered invoice amounts. Updating a figure retains every revision.
-- The operator is responsible for matching invoice totals and allocating shared GPU expenses.
CREATE TABLE IF NOT EXISTS comparison_invoice_revisions (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES comparison_runs(id),
  revision integer NOT NULL CHECK(revision > 0),
  amount_micro_usd bigint NOT NULL CHECK(amount_micro_usd >= 0),
  evidence_reference text NOT NULL CHECK(length(evidence_reference) BETWEEN 5 AND 500),
  allocation_method text NOT NULL CHECK(length(allocation_method) BETWEEN 5 AND 1000),
  certainty text NOT NULL CHECK(certainty IN ('invoiced','reconciled')),
  includes_full_allocated_cost boolean NOT NULL DEFAULT false,
  reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, revision),
  CHECK(certainty <> 'reconciled' OR includes_full_allocated_cost)
);
CREATE INDEX IF NOT EXISTS comparison_invoice_by_run ON comparison_invoice_revisions(run_id, revision DESC);
