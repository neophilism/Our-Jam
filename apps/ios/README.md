# Our Jam native iOS rehearsal target

This is an actual SwiftUI audience application using the existing `/api/mobile/session` and event API, not a WebView, seeded demo or substitute stage screen. It contains no third-party runtime or build packages. The Expo Android/iOS draft in PR #11 stays separate and its security gate is not relaxed. See `docs/adr/ios-rehearsal-target.md` for the deliberate scope and maintenance tradeoff.

## Run an actual iOS Simulator

A Mac with Xcode, command-line tools and an installed iOS Simulator runtime is required. Apple Developer membership and an Expo account are not needed for the simulator target.

From the repository root run:

```sh
bash apps/ios/Scripts/launch-simulator.sh
```

This builds the app with the local Mac's architecture, tests its contract code, boots an available iPhone simulator and installs/opens the app. It does not start a fake backend or generate fake participants. Enter the actual Our Jam HTTPS origin and your event code in the app. Simulator-only localhost HTTP is supported for local integration testing. Physical-device builds require HTTPS.

The `Native iOS rehearsal` GitHub Actions workflow builds Intel and Apple Silicon variants on standard public-repository runners, runs tests, installs the resulting native app in a real Simulator and captures launch evidence. Download the artifact matching your Mac. Its ZIP contains `OurJam.app`. With an iPhone simulator booted:

```sh
xcrun simctl install booted /absolute/path/to/OurJam.app
xcrun simctl launch booted com.neophilism.ourjam.rehearsal
```

These are simulator artifacts, not `.ipa` files, TestFlight builds, or App Store submissions. An uploaded artifact or launch screenshot does not establish that a real backend or physical audio route was tested.

## Use the real performer and public display

On the Mac, open the same origin at `/performer`, sign in separately, prepare your real album and start an event. Open `/screen/EVENT-CODE` in its own browser window. That is the existing actual public display; move that same window onto the external monitor and enter full-screen mode. Enter the event code in the native client; join as listener or supply the room's voting code. Native submissions and five-point allocations go to the same server records and therefore appear on the public screen.

When a round ends, the job UI displays server states. `approved_budget_zero` explicitly means the local spending policy prevented a chargeable call, not that a provider was contacted and reported an empty credit balance. Audience contributions are independent of funding. No automatic budget change is scheduled for Thursday.

## Implemented scope and boundaries

- Origin-scoped Keychain bearer sessions, exact-Origin requests, no cookie storage, API redirects refused, bounded response size.
- Real event snapshots, listener/room-code admission, submissions, five-point reallocations, revision fencing and no mutation replay after uncertainty.
- Foreground-only polling, server-clock deadline display, stale/offline guards, room changes, name/anonymity editing and remote sign-out.
- Actual published audio playback, download links, generation failure explanations and public/performer links. Playback pauses when the application or Tracks view becomes inactive. No native token is attached to CDN media.
- Contract tests cover origin/path validation, cross-origin credential protection, budget arithmetic and honest generation status labeling.

This bounded native rehearsal increment does not complete V1. Native recovery/follow UI, qualified listening telemetry, reactions/comments, push, background/offline audio, accessibility/device acceptance, artwork, privacy-store metadata and signed distribution remain. Full web versions of many of these already exist. Do not merge or distribute the blocked Expo draft on the strength of this unrelated target. The server remains authoritative for admission, moderation, privacy, budgets and provider dispatch.

## Security and lifecycle

No provider, operator, database or storage key belongs in the app, plist, command-line arguments or repository. Only a scoped native guest token is stored in Keychain. Runtime origin and event code are non-secret user preferences. The new bundle ID is `com.neophilism.ourjam.rehearsal`, avoiding a silent replacement of the configured production app identity. Do not add an App Store record for this rehearsal ID.

The UI does not silently create a new identity when a token expires. It asks the user to reconnect; verified/cross-device identity recovery is still separate. Public media links are short-lived or server-protected as implemented by the existing API. This server-authorized generation architecture is not an end-to-end-encryption claim or an E2EESA certification.
