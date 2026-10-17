# Shared platform administration and migration compatibility

This development-only integration brings main commit `54b6a4c2cd3fecff0938e07dd76f195f980093d6` (platform-wide fixed/artist-range voting) into the commerce, sponsor and identity stack. It does not change main, the other agent's branch, or the active rehearsal.

Both independent branches introduced a `009` migration and `platform_admin_sessions`. Migration identity is the full filename, so retain both `009_event_commerce_sponsors.sql` and `009_platform_vote_policy.sql`; do not rename recorded migrations or mark unapplied work complete. The sole compatibility change to their shared-table creation is `IF NOT EXISTS`, with the same columns and constraints. An existing table/session survives either upgrade order. Twelve migration records are required by integrated readiness.

One platform administrator login/logout/session implementation now serves voting and sponsor/payment administration, using the same hashed `oj_platform_admin` session table. Production configuration prefers `PLATFORM_ADMIN_TOKEN` and retains `ADMIN_TOKEN` as a legacy fallback. It never grants performer access. Voting is available at `/admin`, with a linked `/admin/commerce` page for payments and silent sponsor videos. Both pages recognize the same server session.

Platform voting limits and frozen sponsor openings coexist in each round's immutable settings. Artist edits cannot override platform voting policy; payment access still requires server-verified durations; sponsor time still pauses with playback and blocks premature participation. Uploaded tracks retain server-verified length when editing their descriptions, and legacy linked tracks are measured automatically.

Local integration tests verify both existing migration histories upgrade without replacing administrator sessions, a single admin session authorizes both sections and logout revokes both, and that admin access does not imply performer access. The broader integrated app/browser/native workflows must pass before merging into development. Real hosted provider/phone acceptance is still required before main.
