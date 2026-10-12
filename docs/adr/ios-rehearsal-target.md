# ADR: dependency-free iOS rehearsal target

Date: 2026-10-12. Scope: a native real-data rehearsal for issue #22; not a replacement for the 54-work-package roadmap.

The owner needs an actual native app and the existing public display at zero new spend. They do not yet have Apple Developer membership. The Expo draft remains blocked by its audited dependency findings. Re-labeling a web viewport as a simulator, shipping that draft despite its gate, or fabricating music would not meet the request.

Add a bounded SwiftUI target using only Apple frameworks, with a separate rehearsal bundle identifier. It consumes the current HTTP/JSON contract and native guest API, adds no server schema and carries no service credentials. Simulator compilation, contract tests and launch checks run on standard GitHub-hosted public-repository runners, without Expo/signing/provider secrets. Existing application CI remains required. Do not introduce paid runners or provider calls.

Tradeoff: this temporarily adds a second native UI and duplicated JSON model declarations. The shared wire contract must stay aligned through tests and follow-up integration checks. The target delivers the core native rehearsal interactions, not Android parity or full V1. Native release architecture should be reconciled before App Store submission; do not create an extra production store entry or abandon Expo's unresolved security work silently.

The real web performer/public routes are unchanged. No simulated clients, sound elements or audio are shipped with this target. Native live-provider and native-to-stage acceptance require a running authorized backend and actual test evidence; a Simulator launch screenshot only proves launch.

Rollback is removal of `apps/ios` and its workflow. There are no data migrations and no shared runtime dependency changes. The Keychain namespace is isolated to the rehearsal bundle. Existing native and browser identities are not reassigned.
