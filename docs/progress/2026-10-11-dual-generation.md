# Dual-provider implementation session

User instruction: integrate Mureka and Stable Audio behind a simple toggle; respect an immediate $0 spending limit; use the real audience app and actual public monitor surface, with no seeded production data. The user reports repository secrets MUREKA_API_KEY and STABLE_AUDIO_KEY, no Apple membership yet, and confirms Phillip's Render workspace. Previously approved project resources and migrations 001-008 remain the selected scope.

This increment implements the provider adapters, frozen per-round selection, operator controls, explicit zero-budget worker rejection, typed media handling, and isolated regression tests. It supports the exact STABLE_AUDIO_KEY name. Runtime activation and real provider acceptance remain unverified. GitHub secrets cannot be read through the connector and are not automatically copied to Render. No billable request or real email was made.

The read-only inspection confirmed Neon object storage is enabled on br-blue-unit-b5rk1hit, with the branch-specific us-east-2 endpoint. Render listing now shows fewer services than the earlier limit, but listing alone is not proof of successful deployment. Apple membership remains a TestFlight prerequisite; genuine simulator builds remain separate from .ipa distribution.

Relevant original work packages: generation adapters/jobs (P014-P016), performer controls (P020), deployment/rehearsal (P026), native delivery (P032). This is implementation progress, not closure of those work packages. See docs/dual-generation.md and issue #22. Fresh exact-head CI, deployment and browser evidence must be appended before completion claims.
