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
