# Production schema initialization and native recovery acceptance

## Observed October 12, 2026

The owner explicitly requested another deployment attempt and continued implementation. A fresh standard Render free-service create was rejected by the tool safety check; no alternate deployment route was used and no service or hosted URL was claimed. No paid request or resource was authorized by this work.

The same continuation successfully applied the previously approved migrations 001-008 to Our Jam's empty production Neon branch `br-aged-sea-b55fzq0v` in project `crimson-hat-87508124`, database `neondb`. The transaction held an advisory lock and refused a nonempty public schema. All eight migration names were read back. Counts for events, participants, generation_jobs and email_jobs were each zero. The baseline artist and dispatch-control row are part of the migrations, not demonstration content.

A read-only Neon schema comparison with rehearsed branch `br-blue-unit-b5rk1hit` returned `{ "diff": "" }`. Production `our_jam_app` privileges were inspected after creation: NOLOGIN, no superuser, no role/database creation, no RLS bypass, no public-schema CREATE, and no INSERT into schema_migrations; application event INSERT is allowed. No production password exists from this operation and no runtime is connected. Retain this NOLOGIN state until a deployment destination is actually authorized and available.

PR30's native disclosure bug was fixed instead of skipping the failed test. Head `6c66b928f66ad0a513abd711e277773b1e3f03d1` passed application run `38318745155` and real iOS Simulator/native-to-stage run `38318745320`. Both check runs concluded success before PR30 merged as `468d97602fc1829642c3d090a967310e1d8e1dc7`. The accepted Simulator artifact is `11777969850` with SHA-256 `902fd8df1ad944a84fd4b39a8813bd3ac7e751db01c86d21b949fada4852dc19`. It includes profile restoration and following, not physical-device/store acceptance.

Dependent PR32 was retargeted to main and its branch explicitly merged the actual main commit without dropping history. PR34 independently adds explicit saved-task reconciliation with no new generation POST. Their acceptance must be read from their actual final-head runs; this record does not predeclare either merge.

## Continuing gates

Hosted service creation, runtime credential wiring, live private media delivery, funded provider verification, physical phone/audio/venue rehearsal, Android's dependency resolution, remaining V1 implementation and qualified independent security review remain separate. The immediate budget is still $0. The 54 original work packages and dependency plan remain unchanged.

Rollback does not delete the initialized database or its migration history. With no user data or runtime login, leave the prepared schema in place; use normal versioned migrations for subsequent corrections. Revert native UI through an ordinary tested code change, without deleting recovery hashes or follows.
