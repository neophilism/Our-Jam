# Native profile recovery and following - October 12, 2026

The iOS profile screen uses the existing recovery and following APIs. A fan can create/replace or disable a recovery key, follow/unfollow the current artist, and restore the same profile from the connection screen. Recovery uses channel=mobile, validates the returned guest token, and writes it only into origin-scoped Keychain. Existing server rules preserve identity/follows and revoke the recovered profile's other guest sessions.

Recovery keys are transient UI state, cleared on scene inactivity/view departure, and never deliberately saved in preferences, logs, URLs or the clipboard. Restore uses a secure field, a user-confirmed server origin and explicit confirmation. Connection controls stay disabled while restoring. Following does not opt a fan into email.

At head 70d1d2c49257e0ed145be43db11c3d964b3d0d34, standard application checks passed run 38248060440. Native run 38248061303 compiled both architectures, but SDK discovery timed out before any UI test ran; this is not native recovery acceptance. The SDK is now read from the built Info.plist instead of a redundant xcrun lookup. Simulator Keychain signing and the fixed connection-error banner from the current PR25 are retained.

Native XCUITest exercises profile editing, following, key issuance and restoration against an isolated loopback database. Its credentials are disposable CI-only data. Existing native Sound Wave participation and public-screen verification remain required. Fresh exact-head native integration evidence is still required before claiming completion.

This depends on PR25 and advances OJ-031/OJ-032 without a schema, service, provider request, paid membership or spending. Reverting the UI does not delete saved profiles, follows or keys. Live provider, physical-device, accessibility and store acceptance remain separate gates.
