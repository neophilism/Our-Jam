# Our Jam native audience client — internal development

This Expo SDK 57 / React Native client uses the same live API as the web application. It includes event-code/link entry, five-point voting and contribution, reduced-motion-aware animated waves, bounded/searchable wave controls, native foreground audio, listening feedback, comments/reporting, profile anonymity and event leaderboards.

## Verification and current block

TypeScript and iOS/Android Hermes bundle exports pass locally. Expo native configuration generation passes for both platforms. The server integration suite verifies native/browser voting parity, token scope, Origin checks and revocation. None of this is a physical-device, simulator, signed binary or App Store review result.

**Do not merge or distribute this client while its dependency gate fails.** The stable SDK transitively pulls unpatched high-severity advisories:
- braces: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- node-forge: https://github.com/advisories/GHSA-86w9-cpqp-85rv

The audit also reports a moderate uuid advisory. The count includes dependent packages, not that many independent vulnerabilities. Keep the blocking audit step. Do not use npm's suggested forced downgrade to Expo 44; it is incompatible with this client. Resolve through compatible patched upstream dependencies and repeat bundle/configuration/device checks. No signing key, EAS project, provider key or native distribution credential has been configured.

## Local workflow

From this directory:

```sh
npm ci
npm run typecheck
npm run export
npx expo prebuild --no-install
npm audit --audit-level=high
```

Before running against a deployed rehearsal environment, set `EXPO_PUBLIC_API_ORIGIN` to that application's exact HTTPS origin. This is a public address, never a secret. Copy `.env.example` to a local ignored env file. Start with `npm start`. Generated iOS/Android project folders and bundles are ignored; app configuration and the lockfile are the source of truth. The proposed identifiers are `com.neophilism.ourjam`; ownership/store availability remains unverified. Native compilation uses project-specific build credentials only after the audit and deployment gates.

## Identity and navigation

Tokens are stored with Expo SecureStore under a key derived from the API origin; requests omit browser cookies. A stored expired token is not silently replaced with a new identity. Reset revokes the token, then removes it from secure storage. Contributions remain and account recovery is not implemented. API authorization is guest-only; use the responsive performer console for artist controls.

Enter an event code or that server's `/event/<code>` link. The custom scheme `ourjam://event/<code>` is registered. Universal/app links and camera scanning are not configured; the public QR continues to open the web experience.

## Actual behavior and remaining parity

Snapshots refresh every five seconds while foregrounded, refresh on resume, and disable local voting when contact is stale. Mutations are not queued offline or silently replayed. Server deadlines, revisions and budgets remain authoritative. Foreground release announcements are not OS push notifications.

Audio is explicitly started and stops when the app backgrounds. This slice requests no microphone access. Downloads open the public file in the device browser; native offline file management, lock-screen/background playback, native recording, 3D rendering, avatar upload, cross-device account linking and persistent feedback reminders remain open.

Before claiming P032–P036 acceptance: fix dependency findings; deploy staging; compile/install signed internal builds on iPhone and Android; verify network loss and token expiry; test VoiceOver/TalkBack, text scaling, headphone disconnect and audio interruption; inspect permissions; complete privacy/account deletion/report blocking and regional store purchase-link decisions; configure verified domain links and notifications; perform venue/load/thermal rehearsal.

Official implementation references: https://expo.dev/changelog/sdk-57, https://docs.expo.dev/versions/v57.0.0/sdk/audio/, https://docs.expo.dev/versions/latest/sdk/securestore/.
