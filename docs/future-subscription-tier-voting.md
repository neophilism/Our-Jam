# Future implementation plan: subscription-tier Sound Wave vote ranges

**Status: deferred. This pull request is specification ONLY and must stay in draft. Do not merge or implement until the account/subscription and payments teams have established stable entitlement contracts and the platform owner authorizes work on tiers.**

## Goal

Allow the platform administrator to set different permitted vote ranges **per artist subscription/account tier**. Higher-priced artist subscriptions may permit wider ranges for the number of **different Sound Waves** a fan can vote on in a song. Artist choice within the tier's range remains optional, and the platform administrator must retain final authority over every tier's floor/ceiling.

The current implementation uses one platform-wide fixed vote allowance, or one platform-wide artist-selectable range. This deferred work must not replace or weaken that policy before subscriptions are ready.

## Dependencies and required decisions

- Confirm the canonical account owner/tier identity from the separate ongoing sign-in and billing work. Use their verified entitlement API rather than inferring a tier from client-provided strings, checkout return pages, or card details.
- Define and version tiers (IDs not marketing names), payment status, activation/expiration, grace periods, refunds/chargebacks, upgrades/downgrades, trials, cancellation, and trial abuse prevention.
- Determine whether paid tiers allow a wider *artist-selected range* or force different per-event fixed caps, and whether changes apply to only future rounds, future events, or future renewals.
- Retain an administrative global safety ceiling; proposed future flexibility must not imply unlimited votes or lift current round wave capacity without explicit load testing.
- Resolve legacy event behavior and preserve vote-policy snapshots on in-progress rounds.
- Include accessible artist-facing upgrade messaging that does not shame free creators or confuse listener voting with purchasing.

## Intended precedence

Global administrator emergency maximum / safety cap
→ validated, active artist subscription entitlement
→ administrator-configured permitted range for that tier
→ artist-selected show allowance
→ frozen per-song voting policy.

The server is authoritative. A downgrade should never corrupt an open round, silently permit more votes than approved on a new one, or delete existing paid-for content. For invalid/missing entitlement data, fail safely to a documented base-tier allowance without triggering unexpected charges.

## Interfaces and data model (to design, not build now)

An admin page for tier policy: validated plan ID, 1–1,000 per-listener minimum and maximum, default, effective date, version, preview, publish/revert, audit. Artist show setup reads the permitted range and explains whether any particular amount is available for that account. Keep the user experience distinct from fan purchases and Sound Wave votes.

Persist immutable entitlement-policy snapshots in the opening round, with attribution to a policy version and tier decision, but never expose private billing identifiers or history in public room snapshots.

## Security and acceptance

Tests for forged tiers, stale subscription status, grace-period edges, refund/downgrade races, idempotent webhooks, out-of-range writes, cross-account access, rollback, legacy events, thousands of listeners, concurrent voting, and no billing-provider callbacks from voting requests. Test that an artist cannot change subscription status or vote caps with browser-side edits.

**Explicitly out of scope until requested:** subscriptions, payment processing, price configuration, subscription catalog migration, entitlement claims, tier validation, and any change to current global-vote controls.
