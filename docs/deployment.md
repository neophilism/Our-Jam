# Deploying Our Jam

Target only Render project `prj-db5btotckfvc739m1ck0` and Neon project `crimson-hat-87508124`. Production database branch: `br-aged-sea-b55fzq0v`. Migration rehearsal branch: `br-blue-unit-b5rk1hit` (`dev-our-jam-foundation`).

## Current external state

No Our Jam Render service has been deployed. The connected service-creation API cannot assign a project/environment; the dashboard attempt timed out. No Render API credential was present. This is an access/capability block, not a failed application deployment. Do not create an unassigned service or guess a project name. The production Neon branch remains untouched.

## Concrete deployment procedure

1. Confirm the exact environment inside the supplied Render project. Create/sync the service described by `render.yaml` in that environment. The root-level service definition deliberately does not create a project with an assumed name. Confirm the rendered plan before applying; it contains one free service and no new database, worker, disk or paid resource.
2. Build the repository's Dockerfile. It uses Node 24, pinned npm dependencies, a non-root runtime and FFmpeg/FFprobe. Local Docker execution was unavailable in the development workspace; CI validates the image build.
3. Rehearse pending versioned migrations on the isolated Neon branch. Apply reviewed migrations to the empty production branch with a direct, project-specific URL using the compiled migration entry point: `node dist/server/apps/api/src/migrate.js`. Supply `DATABASE_URL_UNPOOLED`. Runtime API access uses the pooled URL. Do not print either credential.
4. Set `DATABASE_URL` to that production branch's pooled connection, `PUBLIC_ORIGIN` to the service's exact HTTPS origin and retain the generated `OPERATOR_TOKEN` securely. Leave migration-on-start disabled after applying migrations. Log in at `/performer`; the token becomes a 12-hour HttpOnly session. Do not send it through a URL or commit it.
5. Verify `/api/health` reports the deployed commit and `/api/ready` verifies the schema. Then verify HTTPS/cookies, join from two independent browsers, vote, pause/resume, close exactly once, and review public/private projections.
6. Add your actual album audio URLs, core prompts, correct track durations and purchase URL through the performer setup. Use an isolated rehearsal event first. Keep a local album player and independent recorder available.
7. Configure approved music/storage credentials and budget only after the provider gate. See `generation-implementation.md`. Upgrade hosting or add a worker only with an approved spend; the free Blueprint is a rehearsal starting point, not an event uptime promise.

## Recovery and release operation

Take a Neon branch/checkpoint before future risky migrations. Revert application releases with Render's verified prior deploy while preserving data. Never roll back to an application that cannot read active paused rounds without draining them first. Do not delete votes/jobs as a recovery shortcut. Paused voting and UNKNOWN generation jobs require explicit reconciliation. Private generated assets and microphone chunks are separate: microphone recordings currently remain only on the recording device.

No emails, real provider requests, paid resources or production data mutations have occurred during development. Native builds, real-device rehearsal, hardware capture and independent security assessment remain release gates.
