# Continuous integration provider — October 17, 2026

Our Jam uses **GitHub Actions as the only required CI provider** while this repository is public. CircleCI is not a release or pull-request gate; its redundant configuration was removed after an unrelated Homebrew CA-certificates failure prevented a CircleCI macOS native test from reaching compilation.

Required evidence is per *exact commit*:
- `.github/workflows/ci.yml`: plan validation, TypeScript, tests, application build, dependency audit, Chromium desktop/mobile browser features and Docker build.
- `.github/workflows/ios-simulator.yml`: genuine Apple Silicon iOS Simulator build, signed simulator artifact, two separate one-tap account returns and observed native-to-public-screen test. This workflow runs on development/main pushes; for PRs it runs when native, identity or shared CSS files change.
- `.github/workflows/e2eesa-status.yml`: evidence integrity status only, not independent security certification.
- `.github/workflows/hosted-development.yml`: real isolated-host admin/performer sessions and browser acceptance using existing Render API access. It reads secrets only inside a protected GitHub Actions job, does not upload credentials and does not mutate the hosting configuration.

The development deployment workflow waits for **GitHub Actions native iOS** success on the same push. It has no CircleCI dependency.

Before merging to the feature branch, verify applicable GitHub Actions checks and any hosted acceptance. Keep the aggregate commerce/sponsor/identity PR in draft; do not merge it into main or alter the active rehearsal environment until Stripe sandbox, managed Google/email, browser and physical-device acceptance is complete.

Stripe sandbox keys reported by the owner must be **verified by the hosted setup diagnostic and actual sandbox Checkout, signed webhook and refund tests**. A reported credential change is not itself payment acceptance. Never expose secret values, cookies, payment tokens or user account data in CI evidence.
