# Our-Jam portable free-host handoff

An immutable Node 24 + FFmpeg Docker image can now be built in GitHub Actions and (on main or manual dispatch) published as `ghcr.io/neophilism/our-jam:sha-<commit>`. It preserves the existing Dockerfile, app and Neon database; it does not create a host or use paid resources.

**To run a compatible free container host:** choose the `main` release image for the exact tested revision, deploy the image on a container service able to execute Node 24 and FFmpeg, listen on `0.0.0.0:10000`, and install **existing project-specific** private runtime secrets directly in that provider's protected environment. Required live configuration is documented in `docs/deployment.md` and includes an **existing restricted** Neon `DATABASE_URL`, an exact new `PUBLIC_ORIGIN`, a private `OPERATOR_TOKEN`, compatible S3 media credentials, `RUN_MIGRATIONS=0`, `GENERATION_ENABLED=0`, `RUN_INLINE_GENERATION=0`, `EMAIL_ENABLED=0`. Do not copy session secrets to source code or switch rehearsal database branches implicitly.

Deploy the rehearsal system with the rehearsal branch only and verify `/api/health`, `/api/ready`, real musician upload and playback, authorization denial, and a real phone test before announcing usability. Both hosted production and rehearsal were suspended by Render account-wide free hour limits on Oct 20, 2026. Until another provider is connected and validated, do not call this recovered.

The OCI image supports *one* preferred active site with DDM's ranked alternatives; publishing an image does not auto-run copies everywhere. GitHub Actions is manual or triggered when this specific release workflow/Dockerfile changes, so normal feature commits do not rebuild unused images.
