> **October 16, 2026 update:** This October 12 snapshot is preserved as historical evidence. The dedicated free Render service now exists and is live at https://our-jam-rehearsal.onrender.com on a restricted **rehearsal** Neon login. Health/readiness GitHub Actions smoke passed on October 16, and branch-bound private Object Storage secrets have been installed on Render. Live storage object round-trip and an owner-file/physical-device rehearsal remain separate acceptance gates. See docs/deployment.md for the newer sequence. No paid generation or email is enabled.

# Resource reconciliation for zero-budget rehearsal

Updated October 12, 2026. This record supersedes earlier external-state claims. The production database schema is now initialized; the hosted application is not deployed.

## Authority and spending

The owner confirmed Phillip's workspace (`tea-db23jkks728c73av263g`), reports GitHub secrets `MUREKA_API_KEY` and `STABLE_AUDIO_KEY`, and set an immediate $0 spending limit. Prior scoped authorization for the production migration set and making a Render slot available exists. The owner explicitly asked to retry deployment on October 12. Do not ask for the same broad approvals as though absent. This does not authorize a paid upgrade, unrelated service deletion, provider call, email or an automatic Thursday budget increase.

## Render

Discovery had already shown fewer services than the earlier Hobby cap. Following the owner's retry request, the normal Render `create_web_service` action was called again for a dedicated free `our-jam-rehearsal` Docker service in the confirmed workspace, using the isolated project database and hard $0 generation limits. The action was rejected by the tool safety check before service creation. There is still no confirmed Our Jam service, deployed commit or hosted URL. Do not describe this as just an outstanding service-count limit or missing user approval. Do not reroute the denied operation through another tool, provider or split request. The separately authorized same-Mac runtime creates no cloud resources and uses no production credentials.

## Neon database: production initialization succeeded

Project: `crimson-hat-87508124`, database: `neondb`.

The isolated rehearsal branch `br-blue-unit-b5rk1hit` has migrations 001-008 and the previously verified restricted `our_jam_app` login. Its role has no database/role creation or RLS bypass.

The production branch `br-aged-sea-b55fzq0v` was checked again and its public schema was empty. The approved existing migrations 001-008 were then applied in one transaction, with an advisory transaction lock and a precondition that refused a nonempty public schema. Read-back returned all eight migration names, zero events, zero participants, zero generation jobs and zero email jobs. Only the migrations' baseline Our Jam artist and dispatch-control row were inserted. No synthetic songs, crowd activity or paid work was seeded.

Neon's schema comparison between production and the rehearsal branch returned an empty diff. The production schema therefore matches the rehearsed schema at this inspection.

A production `our_jam_app` role was created as **NOLOGIN** with application DML and sequence access and read-only migration history. Verification returned: login=false, superuser=false, create-role=false, create-database=false, bypass-RLS=false, public-schema-create=false, migration-history-insert=false, events-insert=true. No production password was issued. Enable scoped runtime login and provision its secret only when an authorized deployment destination exists; do not use the schema owner for the application. This completed initialization is not evidence that a deployed API is connected to it.

## Private audio storage

Object Storage is enabled. Private bucket `our-jam-media` exists on the isolated branch, created October 11 at 23:40:54 UTC. Its endpoint is `https://br-blue-unit-b5rk1hit.storage.c-7.us-east-2.aws.neon.tech`, region `us-east-2`, using path-style S3. Store audio objects there, not large relational rows. Real hosted ingestion/delivery and runtime credential wiring remain unverified. The earlier unused temporary storage credential was revoked. Local rehearsal instead uses private files with a 1 GiB cap; file permissions are not application-level encryption.

Neon's official Object Storage announcement: https://neon.com/blog/neon-backend-is-ga. Product availability is not application integration evidence or permission to incur charges.

## Native distribution and provider evidence

PR30's profile recovery/following now passed both actual native interaction and native-to-stage checks on head `6c66b928f66ad0a513abd711e277773b1e3f03d1`: application run `38318745155`, native run `38318745320`. It merged as `468d97602fc1829642c3d090a967310e1d8e1dc7`. The saved recovery key remains visible through a snapshot refresh and restores the profile and follow state. The accepted Simulator package is artifact `11777969850`; it is not an Apple-signed physical-device or TestFlight build. The owner does not yet have Apple Developer membership. Standard public-repository runners are used, not paid larger runners.

Actual music requests remain prevented at $0. Tags and votes work independently. Eligible round closure records `approved_budget_zero` before any chargeable attempt; upstream credit failures are separate fixture-tested states. Reported GitHub secrets have not been read or validated through real music requests and are not established as Render runtime variables. Provider quality, latency, billing, hosted media delivery, actual phone participation and physical audio rehearsal remain separate acceptance gates.
