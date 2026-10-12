# Deploying Our Jam

The intended grouping target is Render project `prj-db5btotckfvc739m1ck0` and Neon project `crimson-hat-87508124`. Production database branch: `br-aged-sea-b55fzq0v`. Rehearsal branch: `br-blue-unit-b5rk1hit` (`dev-our-jam-foundation`). The exact current external evidence is in [resource reconciliation](rehearsal-resource-state.md).

## Current external state

Production migrations 001-008 were successfully initialized and verified on October 12, 2026, under the owner's previously recorded and renewed authorization. The production schema matches the rehearsal schema with an empty Neon schema diff and contains no user events, participants, generation jobs or email jobs. Do not repeat initialization or tell the owner this schema approval is still missing.

The production `our_jam_app` role has restricted application DML/sequence permissions and read-only migration history. It deliberately remains NOLOGIN, with no production credential issued, until an authorized hosted destination exists. The isolated rehearsal branch has its own restricted runtime login. No credential values belong in source or documentation.

There is still no Our Jam Render service or hosted URL. The earlier 25-service Hobby-cap error was followed by discovery of lower service count and tool-safety rejection. After the owner explicitly requested another attempt on October 12, the normal free dedicated service-creation action was again rejected before creation. Do not reroute that denied operation or claim that changing a parameter, tool, provider or request split removes the rejection. No unrelated service was deleted or repurposed.

Private Neon Object Storage exists on the isolated branch. Live storage ingestion/delivery and runtime wiring are not yet accepted. Both music providers remain subject to the owner's hard $0 limit; no paid generation or real email delivery is enabled.

## Deployment procedure when the deployment action is available

1. Confirm the confirmed workspace and actual environment; use the reviewed root `render.yaml` definition and Dockerfile. The definition creates one free rehearsal web service, not a paid worker, disk, database or assumed project. Do not work around a tool denial. Grouping can be applied separately when the connector supports it; this is not permission to reuse another project's service.
2. Use the repository's Node 24, locked dependencies, non-root Docker runtime and FFmpeg/FFprobe. The existing application CI includes the actual Docker build. Keep auto-deployment off for live shows.
3. Select production or isolated rehearsal explicitly. Both currently have migrations 001-008. Before any future schema change, rehearse the exact additive migration on the isolated branch, verify the target's current history, and apply using the project-specific direct connection. Never reset or reinitialize the populated production schema. Runtime uses the restricted pooled connection; migration-on-start remains disabled.
4. Provision a strong scoped runtime credential only into the approved service secret store. Enable the prepared production runtime role only when deploying to production. Never supply a schema-owner or administrative connection to the application. Set exact `PUBLIC_ORIGIN`, or use validated `RENDER_EXTERNAL_URL` when `RENDER=true`. Keep `OPERATOR_TOKEN` private and out of URLs. The performer login exchanges it for the existing 12-hour HttpOnly session.
5. Set both generation budget limits to zero, email delivery off, and migration-on-start off for the first hosted validation. Provider keys are not required to verify audience participation and the no-call budget boundary. Do not infer runtime secrets from their presence in GitHub.
6. Verify `/api/health` and the deployed commit, `/api/ready` and migration history, exact HTTPS/cookie behavior, private projections and media access. Then use two independent browser identities to join, allocate five points, pause/resume and close one round. Do not seed user-facing demonstration activity.
7. In an isolated rehearsal event, upload the owner's real album files with correct core prompts, titles and durations; verify restart persistence and playback. Configure and test the private object store without publishing private masters. Keep an independent local album player and recorder available.
8. Only after an explicit funded allowance, verify both real provider accounts, rights/pricing, quality, latency and the complete generation-to-release/download flow. The provider toggle never authorizes spending. Retain current price/rights checks and test the declared physical hardware and attendance tier before a public show.

## Recovery and release operation

Take a project-specific recovery checkpoint before future risky migrations. Preserve event data, votes, task receipts, reservations and media when reverting application versions. Never roll back to code that cannot read active paused rounds without draining them first. Ambiguous provider jobs must not be converted to queued as a shortcut. Private generated assets and microphone chunks have different storage paths; microphone recordings remain on the recording device.

Production schema initialization and restricted-role preparation are complete; a production application connection is not. Native Simulator acceptance is separate from physical devices, TestFlight, hardware capture and qualified independent security review. Nothing in this procedure certifies full V1 or E2EESA conformance.

## Traffic behavior

Read [live traffic](live-traffic.md) before setting an attendance cap or adding instances. Bounded snapshot work and socket buffers plus deterministic crowd tests do not replace deployed venue measurements. Configure `/api/ready` as the Render health check when an authorized service exists; the direct creation action cannot set it. A free rehearsal service is not an uptime guarantee for a live show.
