# Development deploys without the live browser

The owner requested that routine development stop depending on browser handoffs or repeated credential entry. The deployment job in `.github/workflows/ci.yml` and `scripts/deploy-development.mjs` implements that path. This is implementation and local contract-test evidence, not proof of an actual Render API deployment.

## One-time owner setup

1. Create a Render API key at https://dashboard.render.com/u/settings?add-api-key . Render's API keys act with the account's permissions; use the account authorized for the Our Jam workspace. The code restricts all Render operations to the approved development service. Do not put the control-plane key in application environment variables or chat.
2. In https://github.com/neophilism/Our-Jam/settings/secrets/actions choose **New repository secret**, name it **OUR_JAM_RENDER_API_KEY**, and paste the key. GitHub supplies the separate short-lived `GITHUB_TOKEN`; do not create another GitHub personal token.
3. Authorize the prepared, project-specific development credentials to be saved to Render service **srv-db6n4uid0e5s73aus43g** (`Our-Jam`, https://our-jam.onrender.com). This means the restricted `our_jam_app` database login, distinct performer/admin credentials, and the private acceptance-media access key. Automatic approval review rejected that copy because it did not consider the earlier broad development-hosting approval explicit consent for these secrets and this destination. Do not retry or route the rejected write through the deployment job without that consent. The agent already has prepared project-specific values; the owner does not need to invent or gather replacement Neon credentials.

The existing connector's earlier `cannot deploy suspended service` result does not establish whether it saved configuration before attempting a deployment. The API job reads back service environment settings and validates them before resuming anything. It prints only missing variable names or bounded status messages, never secret values. If configuration is absent, the consented agent must save it before retrying the deploy job.

Once this slice is merged into the development branch, pushes run the full application, browser, dependency-audit, build and Docker job. A deployment job waits for the actual native Simulator workflow to pass on that same push commit. It then validates configuration, updates the service branch through the API, resumes it if needed, deploys the exact accepted commit, and checks public health/commit, database readiness and the real private-media startup probe. A final read-only hosted check verifies private-route authentication and rejection of cross-origin writes. No browser session, interactive deployment approval or recurring scheduler is involved.

Missing the one-time API secret fails only the deployment job on development pushes. Pull-request implementation checks continue, and no PR can access this deployment step. After the secret/configuration is supplied, the failed deployment job can be rerun through the GitHub connector without changing application code.

## Fixed scope and failure behavior

- Only repository `neophilism/Our-Jam`, branch `feature/artist-event-payments-sponsor-video`, Render workspace `tea-db23jkks728c73av263g`, service `srv-db6n4uid0e5s73aus43g`, free Docker plan and origin `https://our-jam.onrender.com` are allowed. The current rehearsal service and main are excluded.
- Database connections must use the isolated `ep-tiny-lab-b5x16bij` endpoint (direct or pooled), `neondb`, and the restricted `our_jam_app` role. Auth, bucket and media endpoint must match the acceptance branch. Runtime migrations stay disabled; schema updates are a separate agent task on this database.
- Paid generation and release-email sending stay off. The startup media round-trip must be enabled and readiness must report it verified. No cloud resources or paid capacity are created.
- Stripe secrets may both be absent: compilation, deterministic payment/webhook tests, auth, sponsor UI tests and deployment do not require them. Actual hosted Checkout/payment/refund acceptance still requires both sandbox secrets. Live Stripe keys/acknowledgment are refused here.
- Newer development commits supersede older ones before a deployment starts. Deploy jobs serialize without canceling an already-submitted deployment. HTTP mutation failures/timeouts are not automatically retried: a timeout may have submitted a deploy, and its receipt/list must be inspected before another submission.
- A live Render receipt is insufficient: the public app must report the accepted commit and verified readiness. Diagnostic errors never echo API bodies, connection strings or tokens.

No actual API deployment, successful hosted media probe, real Google/email account completion or Stripe transaction is claimed until performed. All commerce/identity features remain off main until complete acceptance. The platform-wide voting integration preserves both full migration names, reconciles the shared admin routes and requires twelve migration records; see voting-commerce-integration.md.

## Official references

- API keys: https://render.com/docs/api
- Save environment without deploying: https://api-docs.render.com/reference/update-env-vars-for-service
- Change branch without deploying: https://api-docs.render.com/reference/update-service
- Resume: https://api-docs.render.com/reference/resume-service-1
- Deploy exact commit: https://api-docs.render.com/reference/create-deploy
- Read back service variables: https://api-docs.render.com/reference/get-env-vars-for-service
