# Native audience account sign-in

Development only. Do not merge this slice into main before the full event, sponsor and account feature set is accepted.

The iOS profile screen offers Google/email account signup and sign-in when the selected server enables identity. It uses Apple's ASWebAuthenticationSession and the same managed Neon Auth browser UI. The provider's OAuth client secret stays at Neon; there is no native client secret or embedded password form. Production Google credentials and the actual Auth callback remain the same web-client setup described in development-credential-setup.md.

The app starts from its existing scoped mobile guest session. It creates a random PKCE verifier in memory and sends only the S256 challenge to the application. The server returns a five-minute request ID and a same-origin sign-in URL. The browser requires a verified audience identity and an explicit **Return to iOS with this account** confirmation; choosing performer cannot elevate the native handoff.

The callback uses `com.neophilism.ourjam://signin` with a request ID and a one-use random code. It never contains a reusable app/identity bearer. Redemption requires the original device credential, matching request, callback code, unexpired request and the PKCE verifier. The transaction locks/consumes the grant exactly once. The resulting credential grants audience access only and is saved to origin-scoped Keychain before earlier device access is revoked. Failed Keychain persistence attempts to revoke the replacement and preserves previous device access.

This is an explicit restore of the signed-in account profile. Separate guest profiles/voting budgets are not merged. Existing guest votes stay with their original profile. Mobile device sessions retain the existing 30-day device-session lifetime and device-only sign-out semantics; they are separate from the short web bridge sessions. Signing out a browser does not promise to revoke other devices. Account-wide session administration and account-deletion propagation require separate implementation/acceptance.

Migration 011 adds temporary handoff records. Apply it and runtime grants only on the isolated development database. Deployed readiness now checks all eleven migration records. Handshake records contain hashed codes, not plaintext bearer tokens or PKCE verifiers. Expired requests are removed when a new handoff starts.

Acceptance: API tests cover original-device binding, PKCE, code tampering, one-use concurrent redemption, expiry, exact Origin, verified browser approval, redirect injection, logout and absence of performer access. Desktop/mobile browser acceptance uses controlled provider fixtures and the real handoff API. Native compilation, real ASWebAuthenticationSession/provider completion, physical-device Keychain failure/recovery and cancel/background behavior must pass before completion is claimed.

Primary references: https://www.rfc-editor.org/rfc/rfc8252 ; https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession .
