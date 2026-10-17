# Global Sound Wave vote administration

## Release scope

**The platform administrator** visits `/admin` and signs in with a separate administrator credential (environment variable `ADMIN_TOKEN`, at least 32 characters). Performer credentials do not unlock global settings. An HTTP-only six-hour admin session is isolated from artist/guest sessions; sensitive operations require the same-origin protection, rate-limited login, serializable row locks, optimistic revision checking, idempotent command IDs, and audit records.

The platform-wide selection is either:

- **Fixed:** any whole number 1–1,000. Every newly created single-vote event receives that limit; artists cannot override it.
- **Artist choice:** a platform-approved minimum and maximum, both 1–1,000 with minimum ≤ maximum. New single-vote events and subsequent artist edits may choose any whole number in that interval.

The default is a fixed **five votes**, but the interface describes votes, not points. The policy is held in `platform_vote_policy` and survives restarts; `009_platform_vote_policy.sql` also introduces an admin-session store and an audit table. No external payment integration, account plans, charges, or music-generation provider calls are part of this feature.

## What a vote means

Each listener may place **one vote per distinct Sound Wave** and at most the number allowed for that song. Each original Sound Wave they submit reserves one of their votes. For a show allowing eight votes, a listener may submit two original ideas and vote for up to six other ideas. Votes cannot exceed the number of distinct available Sound Waves, even when the allowance is higher. Their own submissions' votes cannot be removed while those ideas remain active, preventing unlimited submissions through vote recycling. Moderation revokes hidden waves and frees affected votes under the existing transaction rules.

Existing *weighted-mode* rounds retain their historical semantics. Previously opened rounds retain their vote settings regardless of administrator or artist changes. For an event using the modern one-vote-per-Sound-Wave mode, the next round snapshots the then-current platform allowance; a narrowed artist-choice range clamps an old stored selection for future rounds until the artist updates it. Old rounds remain unchanged.

## Safety and boundaries

Maximum allowed votes per listener is currently 1,000 because a round can contain at most 1,000 submitted Sound Waves and the fan can cast only one vote on each. This cap is not a guarantee that 1,000 waves are appropriate for an actual show; venue-load testing is separate. Artist accounts do not gain administrator rights. The admin interface is intentionally unavailable until `ADMIN_TOKEN` is configured. This feature does not introduce subscription tiers.

Rehearse migration 009 on the isolated Neon rehearsal branch and verify exact history before deploying the new app. **Never run migrations on startup with the production database** or grant the restricted runtime login DDL rights. Before deployment, grant the restricted rehearsal role only the necessary row-level DML/sequence permissions for the three new tables. No production service promotion is authorized by this change.

## Verification

Unit/API tests cover login failures, origin protection, idempotent saves, conflicts, invalid fixed/range numbers, fixed overrides, artist out-of-range writes, the eight-vote/two-wave/six-other example, disallowing reclamation of a submitted idea's vote, duplicate/overflow checks, and frozen active rounds. Browser tests cover administrator login, policy toggles, and performer limits. CI includes database, production build, desktop/mobile acceptance, Docker and read-only hosted smoke checks; native simulator checks remain an independent gate.
