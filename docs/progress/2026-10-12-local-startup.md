# Reliable local startup - October 12, 2026

The accepted core native/local rehearsal is extended without adding a paid service or waiting for provider credits. This increment advances OJ-007/OJ-026; it does not add a 55th approved work package or complete native V1.

`Check Our Jam Setup.command` checks Node.js 24, npm, FFmpeg with the required MP3 encoder, FFprobe, and optional Xcode Simulator tools. It does not install software, read provider secrets, alter cloud resources, create rehearsal events or contact a music provider. Missing Xcode does not prevent the existing browser/monitor application from starting.

`Start Our Jam.command` uses the same diagnostic and checks a SHA-256 installation marker tied to package.json, package-lock.json, Node major, OS and CPU architecture. Missing, stale, corrupt or partially deleted installs run the locked `npm ci --include=dev`; a failed install never receives a successful marker. The PGlite/tsx local runtime remains available even when the caller's environment normally omits dev dependencies. Builds and the loopback entrypoint explicitly use development mode. The real server still owns both hard $0 budget values, ignores outside provider configuration and starts without seeded content.

Launch errors remain visible in a double-clicked terminal. No user data are reset. First dependency installation requires internet; already installed, unchanged dependencies are reused. This is not a packaged offline Node/FFmpeg installer and does not imply local prerequisites are already installed on the user's Mac.

Seven focused setup/installation tests passed locally with built-in Node APIs, along with script syntax checks. A wrapper includes those tests in the existing full application CI. Fresh exact-head backend/browser/audit/Docker checks remain required before merge. This change contains no native executable modification and does not replace the separate native Simulator acceptance gate.

Rollback: restore the former launcher and remove the new checker/helper/tests. Installation markers contain only a hash; deleting one merely forces npm ci on the next start. Saved shows, Keychain identity and audio are unaffected. Never include the user's performer-key.txt, database, provider keys or private songs in a release package.
