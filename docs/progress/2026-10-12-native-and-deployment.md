# Native rehearsal and deployment evidence - 2026-10-12

Starting main: `273d47b4220b0a127ae4c4228a69ed3a836dec65`. Main CI `38184884385` succeeded. PRs #23 (Mureka/Stable Audio toggle and zero-budget processing) and #24 (private album upload) are merged. No real provider call has been made in this session. The owner's MUREKA_API_KEY and STABLE_AUDIO_KEY remain reported GitHub secrets; their values were not read and they are not established as Render environment variables.

## External reads and attempted deployment

- Phillip's workspace was explicitly confirmed by the owner. Service discovery showed no Our Jam deployment.
- The isolated Our Jam Neon branch has migrations 001-008, a restricted `our_jam_app` runtime role without role/database creation or RLS bypass, and zero events/jobs at inspection. Production remains empty.
- Neon Object Storage is enabled on the isolated branch, with the existing private `our-jam-media` bucket. A storage-only branch credential was created for the proposed runtime. No secret values belong in this document.
- Creation of a dedicated **free**, auto-deploy-disabled Render rehearsal service with a zero budget was attempted. The tool safety check blocked it before a successful creation response. Do not claim the service exists or retry that denied operation through another mechanism. Hosting remains unverified; this is not evidence of a continuing Render capacity error.

## Native development

`apps/ios` adds a bounded real SwiftUI client with no Expo or other third-party dependencies. It keeps the blocked Expo draft separate. Local Linux Swift contract tests pass (9 tests); a native iOS build and Simulator launch require the newly added macOS CI jobs. Record their exact results before claiming an installable artifact. See the native README and ADR for the deliberately incomplete V1 scope.

No native artifact, TestFlight delivery, real server connection, physical recording, real-provider success, security certification or finished V1 is implied by source creation. TestFlight remains dependent on the owner's Apple membership and signing/submission setup. The current $0 cap is not automatically raised on Thursday.
