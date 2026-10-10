# Secondary demonstration development plan

## Purpose and order

Build this after the production multiplayer V1. It serves technical presentations, a single keyboard user, a showroom installation and explanations of the co-creation process. It is not the validation path for real crowd voting or the first-show delivery strategy.

Use the same domain contracts, renderer and prompt compiler, with isolated sessions, disposable data and a visible Demo label. A presenter can submit waves from a keyboard, allocate votes, trigger a boundary, inspect selected prompt additions, reset the scene and demonstrate different crowd sizes. Keyboard accessibility of the real web app still belongs to V1.

## Two explicit modes

An offline presentation mode uses seeded simulated participants and approved prerecorded audio. It makes no provider calls, sends no notifications and contributes nothing to live leaderboards or artist metrics. On-screen labels identify simulated support and prerecorded results.

An optional real-generation mode uses a distinct demo event budget and actual approved provider access. It labels real outputs, shows actual generation delays and can fall back to a clearly labeled prerecorded example if necessary. Never silently substitute a saved output while claiming a new generation.

Keep demo credentials separate, prevent real-event IDs from being loaded into reset tools, and suppress public publication unless a separately authorized workflow is explicitly invoked. Record presentations without exposing private prompts, account contacts or secrets. Four PRs implement and validate this mode.


## M001 Isolated demonstration sessions

Dependencies: P042.

Scope: Add a separate demo event namespace with keyboard-first single-user operation and disposable state.

Acceptance: Demo data cannot enter real events, public leaderboards, artist analytics or notifications.

Verification: Isolation tests and demo reset E2E.

Rollout: No production override tokens; explicit Demo label.

## M002 Presentation controls and simulated crowd

Dependencies: M001.

Scope: Provide seeded crowd playback, pause, scrub, reveal, reset and venue visualization presets.

Acceptance: Presenters can explain the game reproducibly; simulated votes and recorded audio are unmistakably identified.

Verification: Deterministic replay, reset and side-effect suppression tests.

Rollout: Simulation mode never calls a paid provider.

## M003 Optional real-generation demonstration

Dependencies: M001, M002.

Scope: Add an explicit live-provider option with its own event budget and a clearly marked prerecorded fallback.

Acceptance: Real and prerecorded results cannot be confused; no email, publication or leader credit occurs implicitly.

Verification: Budget, provider failure and output-label tests.

Rollout: Real generation requires configured approved credits and a deliberate mode switch.

## M004 Demonstration packaging and regression gate

Dependencies: M001, M002, M003.

Scope: Create presenter instructions, sample assets with rights, reset scripts and an isolated deploy configuration.

Acceptance: A new presenter can run offline simulation or explicitly enabled real generation without production access.

Verification: Clean-start walkthrough, offline mode and production regression tests.

Rollout: Ship secondarily after production V1; maintain separate credentials and metrics.


