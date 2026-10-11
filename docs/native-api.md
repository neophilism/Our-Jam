# Native guest API

This API slice is independent of the native application's dependency gate. It adds no new runtime package or database migration.

Clients use the deployment's exact HTTPS origin for all API calls and set the `Origin` request header to that value. First call `POST /api/mobile/session` with an empty JSON body. Persist the returned `token` only in platform secure storage, with a key scoped to that origin. Requests then supply `Authorization: Bearer <token>`. Never log a token, put it in a deep link, or copy it to browser localStorage. No browser cookie is issued by this endpoint.

`GET /api/session` returns the current profile. Joining, Sound Wave contribution, five-point allocation, profile, listening, feedback and comment endpoints are the same as the browser API. Use unique command IDs and the latest ballot revision. Do not automatically replay a mutation after a timeout under a new command ID; refresh the authoritative snapshot. Native credentials cannot call artist controls. Mutations retain exact-Origin checks.

`DELETE /api/mobile/session` revokes this guest credential. Expiry or revocation requires an explicit new identity; there is no automatic recovery/account binding yet. Browser and native identities are separate until that work is implemented.

The API regression test creates a native participant and a browser participant in one room, verifies combined votes and the five-point limit, checks public prompt privacy, attempts unauthorized artist controls and cross-origin writes, and verifies revocation. Native device transport/storage behavior is a separate rehearsal requirement.
