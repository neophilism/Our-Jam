# Verify the intended deployed source

The read-only rehearsal smoke accepts an optional `OUR_JAM_EXPECT_COMMIT` containing
the complete expected commit SHA. It rejects a missing, malformed or different
health commit before declaring the deployment source correct. Invalid configuration
exits before network probes. Health metadata is bounded before logging.

For a post-deployment check, set that variable to the independently confirmed release
SHA and run `node scripts/check-hosted-readiness.mjs https://the-authorized-origin`.
Keep `OUR_JAM_REQUIRE_MEDIA_VERIFIED=1` where the private-media round-trip is required.
The existing zero-spend, authorization and Origin checks remain unchanged.

Do not infer a deployment from a pull-request head: routine PR smoke may intentionally
observe the existing rehearsal baseline, so no expected SHA is silently inferred
from CI variables. Omitting the setting preserves baseline smoke compatibility and
does not verify a particular release. A matching public health claim is narrower
than authenticated provider deployment readback or full production acceptance.

No deployment, credentials, paid request, workflow permissions or production
resources are changed by this source-validation helper.
