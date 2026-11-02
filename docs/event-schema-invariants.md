# Event-scoped schema invariants

P003 uses composite foreign keys wherever one event-owned record points to another. A child cannot borrow a source track, round, generation job, release, or queue item from a different event even when every referenced identifier exists.

The migration runner records each ordered SQL file in `schema_migrations`, holds an exclusive migration lock, and skips an already applied file. Re-running the migrator is therefore an idempotency check, not permission to edit an applied migration. Schema changes must be additive migrations.

`tests/schema.test.ts` exercises both contracts against PGlite locally and the isolated PostgreSQL service in CI:

- all current migrations apply once and a second run preserves the same ledger;
- a round cannot reference another event's source track;
- a generation job cannot reference another event's round;
- a release cannot reference another event's generation job;
- a queue item cannot reference another event's source or release.

These checks cover database ownership relationships only. API authorization, artist memberships, storage access, deployment isolation, and production migration rehearsal remain separate plan gates.


## Migration source integrity (OJ-003)

The runner now records SHA-256 of exact migration bytes and checksum provenance.
Before applying any pending migration it validates every existing ledger entry
against the packaged SQL directory. A missing or changed applied file rejects
startup rather than being silently skipped. New migrations record origin
`applied` in the same transaction as their DDL and ledger insertion. A failed
statement rolls back both schema/data effects and the applied record; only an
unapplied file may be corrected and retried.

Existing filename-only ledgers receive additive checksum columns under the
existing exclusive migration lock. Their first available bytes are explicitly
labelled `legacy_observation`, not retroactive proof of the original deployment.
Review the historical artifact when migrating a legacy environment; checksums
cannot authenticate a source or recover missing historical evidence. Subsequent
changes to those observed bytes are rejected. Runtime credentials should retain
read-only ledger access; use the authorized migration role for the additive
ledger upgrade. This change does not grant privileges or apply a live migration.

Preserve every applied SQL file in deployment artifacts. To resolve a mismatch,
restore the exact approved artifact and investigate; do not clear ledger rows,
rewrite checksums, edit applied SQL or run destructive down migrations. Reverting
application code may retain these additive ledger columns. New runner calls keep
the existing default migration directory; an explicit directory supports isolated
fixtures and does not accept an HTTP-supplied path.

`tests/migration-integrity.test.ts` uses isolated PGlite databases to verify changed
bytes, deleted sources, transaction rollback, a corrected unapplied migration and
truthful legacy baselining. The ordinary schema test also replays the full current
migration set against isolated PostgreSQL in CI and checks cross-event references.
Passing these tests is software evidence, not production upgrade or recovery
acceptance.
