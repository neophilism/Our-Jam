# Native Simulator signing and connection diagnostics - October 12, 2026

Run 38246776408 compiled both simulator architectures and launched the actual SwiftUI app on an Xcode-eligible iOS 26.2 Simulator. Its native UI test failed at connection before contribution; native-to-stage acceptance was not reached. The built x86_64 image had no code signature and neither architecture contained application-identifier entitlements. This is distinct from the earlier arbitrary-runtime selection failure, which is fixed.

Simulator builds now use local ad-hoc signing (`CODE_SIGN_IDENTITY=-`) with an app-specific, Simulator-only Keychain entitlement file. This is not an Apple Ad Hoc distribution profile or TestFlight signing. It requires no Apple account, certificate purchase, or service secret. Physical-device signing remains governed by the owner's real team/provisioning setup; the Simulator entitlement override is not applied to iphoneos builds.

Connection errors are now visible in a fixed banner rather than below the fold, and Keychain failures include numeric OSStatus diagnostics without token values. Secure storage failures still fail closed; there is no plaintext/preferences fallback. The workflow verifies the Simulator signature and preserves entitlements as nonsecret evidence. UI tests and stage verification remain required, not bypassed. Exported screenshots, attachments and logs are retained without uploading the large raw xcresult directory.

Swift syntax and project generation were checked locally. Fresh actual macOS build/Keychain/native interaction evidence must pass before this is declared resolved. The previously compiled unsigned artifacts are not the final accepted rehearsal package.

Apple diagnostic reference: https://developer.apple.com/forums/thread/114456 (inspect the built binary's entitlements, not only the input plist). No paid generation, schema mutation or cloud deployment occurs in this correction.
