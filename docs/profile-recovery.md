# Recoverable fan profiles and following

`/account` lets a fan edit their display name/anonymity, create or replace a private recovery key, disable recovery, restore a profile on another device and sign out. The existing profile dialog and liked-track collection link here. Artist pages have a follow toggle; the collection shows followed artists and their latest 24 published, visible crowd releases. Following does not enroll anyone in email or push notifications. Lists of followers are not public; the aggregate count is public.

## Recovery contract

The user explicitly requests a key and is told to save it privately. Keys contain 32 cryptographically random bytes with an `ojr_` prefix. Only a SHA-256 digest is stored. The raw key appears once in the creation response and transient component state; it is not put in URLs, localStorage, server logs, emails or analytics. Saving a plaintext key file is a separate user action. Treat that file like a password.

Recovery does not depend on an email provider. A saved key remains valid until replaced or disabled. It is deliberately reusable: a lost HTTP response can be retried without consuming the only recovery path. Recovery replaces the browser's current guest identity without merging profiles, revokes all previous guest sessions for the recovered identity and creates one new 30-day web or native session. The participant ID and existing votes, memberships, credits, likes and follows remain the same. Recovering does not create another vote budget. Requests already authorized before revocation may finish; subsequent requests reject the revoked credential.

The profile row serializes recovery, key replacement and disablement. Recovery rechecks the key after acquiring that lock so concurrent rotation cannot leave an old key valid. Key changes also recheck the current session after acquiring the lock. The server never returns a stored key/hash through the account status endpoint. Recovery is limited to six attempts/minute per connection address regardless of supplied session credentials; key creation is limited to ten/minute per verified session. Exact Origin remains required, including native requests.

Web recovery returns an HttpOnly, Secure-in-production, SameSite=Strict cookie, without returning that session credential in JSON. Native recovery returns a scoped `ojm_` credential and no cookie. Neither key nor native credential grants artist/performer access. The native API is implemented and tested; the unmerged Expo draft still needs its corresponding user interface before distribution.

This is recovery for guest profiles, not email-verified accounts, passkeys, multi-factor artist authentication or proof of one human. Anyone holding the key can recover that profile. Losing both the key and all valid sessions cannot be repaired by looking up a public name. Profiles are currently retained; self-service export/anonymization is a separate planned increment.

## Endpoints

| Method and route | Behavior |
| --- | --- |
| `GET /api/account` | Own recovery status and active guest-session count; no key/hash |
| `POST /api/account/recovery-key` | Authenticated explicit creation/replacement; one raw key response |
| `DELETE /api/account/recovery-key` | Disable recovery; existing sessions remain |
| `POST /api/account/recover` | `{key, channel: "web" | "mobile"}` restores and revokes earlier guest sessions |
| `DELETE /api/account/session` | Sign out the current guest session |
| `GET /api/artists/:id/follow` | Aggregate follower count and the caller's own following flag |
| `PUT /api/artists/:id/follow` | Set own `{following: boolean}` idempotently |
| `GET /api/following` | Own followed artists and public recent releases |

At most 250 artists can be followed by one profile. Profile-row serialization protects that cap and concurrent repeated follows. Each follow is private to its participant; feed queries filter hidden/unpublished releases at read time and omit asset keys, prompts and other participants' identifiers.

## Deployment and evidence

Migration 008 adds two tables and one index; it changes no existing row format and is compatible with the older application. Apply it before deploying the new API, then reapply `db/runtime-grants.sql` for the restricted runtime role. It was rehearsed transactionally on isolated Neon branch `br-blue-unit-b5rk1hit`; production remains unchanged and requires the previously described approval.

Tests cover web/native restoration, hash-only storage, key rotation/disablement, session revocation, lost-response retry, Origin and operator isolation, rate limiting, follow deduplication, private feeds and recovery of liked tracks. Browser scenarios use independent desktop/mobile-sized contexts, restore a real profile, check prior-session revocation, unfollow, disable recovery and reject the disabled key. They do not prove physical iOS/Android native behavior or production deployment.
