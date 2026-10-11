# Deploying Our Jam

The production grouping target is Render project `prj-db5btotckfvc739m1ck0` and Neon project `crimson-hat-87508124`. Production database branch: `br-aged-sea-b55fzq0v`. Migration rehearsal branch: `br-blue-unit-b5rk1hit` (`dev-our-jam-foundation`).

## Current external state

No Our Jam Render service has been deployed. On October 11, 2026, the user explicitly renewed deployment authorization. A dedicated free `our-jam-rehearsal` Docker service was attempted in workspace `tea-db23jkks728c73av263g`, using the already-rehearsed isolated Neon branch. Render returned **HTTP 400: Hobby Tier is limited to 25 services**. No service was created; no existing service was removed or repurposed. Project assignment also remains unavailable through the connector. Once capacity is available, the dedicated rehearsal service may be created without waiting for project grouping; attach it to the supplied project through the dashboard when possible.

The production branch was inspected and its public schema was empty. Automatic approval review rejected applying migrations 001–007 to that production branch because the transaction replaces constraints/indexes and requires explicit production-schema approval. No production SQL mutation occurred. Do not retry the same mutation through another mechanism. Approval of that reviewed migration set is required before production initialization.

The isolated branch `br-blue-unit-b5rk1hit` has migrations 001–007 and had zero events, participants, generation jobs and subscriptions at deployment preparation. A SQL-created `our_jam_app` login now has application DML and sequence usage, read-only migration history, no schema creation, no role/database creation and no RLS bypass. These grants were inspected on Neon. The unused API-created administrative candidate was removed; only the restricted application login is intended for runtime. No credential value belongs in this document or the repository.

Paid generation and email remain disabled. No new spending was approved. The free plan is a rehearsal target; Render can suspend idle services or restart them, so it is not a live-show uptime guarantee.

## Concrete deployment procedure

1. Resolve the 25-service workspace limit without deleting unrelated services or incurring unapproved cost. Confirm the exact environment inside the supplied Render project. Create/sync the service described by `render.yaml` in that environment. The root-level service definition deliberately does not create a project with an assumed name. Confirm the rendered plan before applying; it contains one free service and no new database, worker, disk or paid resource.
2. Build the repository's Dockerfile. It uses Node 24, pinned npm dependencies, a non-root runtime and FFmpeg/FFprobe. Local Docker execution was unavailable in the development workspace; CI validates the image build.
3. Obtain explicit approval for the production migration set rejected by automatic review. Rehearse pending versioned migrations on the isolated Neon branch. Apply reviewed migrations to the empty production branch with a direct, project-specific URL using the compiled migration entry point: `node dist/server/apps/api/src/migrate.js`. Supply `DATABASE_URL_UNPOOLED`. Runtime API access uses the pooled URL. Do not print either credential.
4. Create a restricted SQL runtime role and apply `db/runtime-grants.sql` on the selected branch. Use its pooled connection for `DATABASE_URL`; never deploy a schema-owner or Neon administrative role. Set `PUBLIC_ORIGIN` to the exact HTTPS origin (or let the application use Render's `RENDER_EXTERNAL_URL` when `RENDER=true`) and retain the generated `OPERATOR_TOKEN` securely. Leave migration-on-start disabled after applying migrations. Log in at `/performer`; the token becomes a 12-hour HttpOnly session. Do not send it through a URL or commit it.
5. Verify `/api/health` reports the deployed commit and `/api/ready` verifies the schema. Then verify HTTPS/cookies, join from two independent browsers, vote, pause/resume, close exactly once, and review public/private projections.
6. Add your actual album audio URLs, core prompts, correct track durations and purchase URL through the performer setup. Use an isolated rehearsal event first. Keep a local album player and independent recorder available.
7. Configure approved music/storage credentials and budget only after the provider gate. See `generation-implementation.md`. Upgrade hosting or add a worker only with an approved spend; the free Blueprint is a rehearsal starting point, not an event uptime promise.

## Recovery and release operation

Take a Neon branch/checkpoint before future risky migrations. Revert application releases with Render's verified prior deploy while preserving data. Never roll back to an application that cannot read active paused rounds without draining them first. Do not delete votes/jobs as a recovery shortcut. Paused voting and UNKNOWN generation jobs require explicit reconciliation. Private generated assets and microphone chunks are separate: microphone recordings currently remain only on the recording device.

No emails, real provider requests, paid resources or production data mutations have occurred during development. The isolated development database now has the restricted runtime login described above. Native builds, real-device rehearsal, hardware capture and independent security assessment remain release gates.

## Traffic behavior

Read `live-traffic.md` before setting an attendance cap or adding instances. The process bounds audience snapshot work and socket buffers; deterministic crowd tests do not replace deployed measurements. Set a `/api/ready` health check in the dashboard because direct service creation cannot configure that field. Auto-deployment must be paused for a live show.
