# Security implementation and evidence boundaries

The upstream End-To-End-Everywhere Security Architecture Standard was retrieved from `neophilism/End-To-End-Everywhere-Security-Architecture-Standard` at commit `ddfbd40c47d13890ebb81ea91c81fe329417058e` on October 10, 2026. It identifies its current tree as development toward 0.9.0-rc.2, not a production certification basis. This project makes **no E2EESA conformance, certification, post-quantum, or end-to-end encryption claim**.

## Data flows

| Data                                  | Intended readers                                  | Protection and remaining work                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public Sound Waves and released audio | Audience, artist, application, approved generator | Deliberately public content; validated commands and authenticated transport                                                                                   |
| Core prompts and generation snapshots | Artist, application, approved provider            | Server authorization; excluded from public snapshots/logs; provider disclosure must be visible                                                                |
| Guest sessions and artist credentials | Respective holder and authentication service      | Random opaque session secrets; only hashes stored; browser HttpOnly cookies; native guest tokens require platform secure storage; no localStorage credentials |
| Unpublished microphone recordings     | Artist's recording device initially               | Local recording until encrypted private upload and consent workflows are implemented                                                                          |
| Feedback and listening telemetry      | Artist and explicitly permitted public summaries  | Minimized records, scoped access and bounded telemetry; not proof of human attention                                                                          |

The server must read voting and generation inputs. The generator is an explicitly disclosed processing endpoint, not a ciphertext-only relay. Public music is intentionally released. No private messaging capability is implemented. Do not retrofit an unsupported E2EE claim onto TLS or server disk encryption.

## Implementation gates

Use schema validation, parameterized SQL, server-authoritative voting, tenant/event foreign keys, same-origin mutation checks, random scoped sessions, redacted logs, request limits and strict authorization. Fail startup when required production configuration is absent. Enforce certificate and host verification for database TLS, with TLS 1.3 minimum. Measure edge TLS separately; Render edge policy is not controlled by application code.

Builds must pin dependencies and record source identity. Ordinary web execution trusts the HTTPS origin. A same-origin service worker does not establish independent verified bootstrap trust. Native signing, independent code transparency, independently authenticated reviews/release authorizers and complete upstream profile assessment remain unverified gates. Automated checks or the author's own review do not stand in for independent review.

Record actual evidence in PROGRESS.md and runbooks. Do not weaken an asserted invariant to pass a test; leave unsupported security claims unclaimed and preserve the outstanding work.

## Native guest transport

`POST /api/mobile/session` creates a 30-day guest credential with the `ojm_` prefix; only its hash is persisted. Bearer transport is accepted for guest access and cannot authorize an artist operation. Existing browser cookies and the exact-Origin mutation check remain in place. Mobile clients explicitly send the configured HTTPS Origin and omit browser cookies. Invalid bearer credentials do not silently fall back to a guest cookie or create a replacement identity. `DELETE /api/mobile/session` revokes the active native credential; it does not delete public contributions or implement recoverable accounts.

Native storage is scoped to the API origin. HTTPS, platform secure storage and token namespaces do not establish end-to-end encryption, app attestation or one-human-one-account enforcement. Signed app distribution and physical-device testing remain gates.
