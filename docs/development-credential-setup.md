# Development acceptance setup

Keep all work on development branches until the complete feature set is accepted. Never point development migrations at the active rehearsal database or merge these changes to main to obtain a preview.

## Hosting

The separate Render development-service creation returned `Hobby Tier is limited to 25 services`. It did not create a service. Do not delete unrelated resources or change the active `our-jam-rehearsal` service to work around this.

The owner approved repurposing the existing suspended `Our-Jam` service as the development host: https://dashboard.render.com/web/srv-db6n4uid0e5s73aus43g . Select the tested development branch in Settings, keep automatic deploys off, and use only the isolated acceptance database/storage/Auth settings. It must not be resumed with old environment settings. The development origin is `https://our-jam.onrender.com`, which is already registered in the isolated Neon Auth branch's trusted domains. The Render connector cannot change branches or resume a service; its environment update currently fails while this service is suspended. The non-browser API deployment workflow now implements branch selection/resume/deploy; see [one-time setup and safeguards](non-browser-development-deploys.md). The owner reported saving `OUR_JAM_RENDER_API_KEY` and gave explicit credential-copy consent on October 17. Saved configuration and API access must still be verified by the workflow. The live browser is no longer the intended deployment path. This is not evidence that it has been deployed.

## Stripe sandbox credentials needed from the owner

1. Open https://dashboard.stripe.com/apikeys and select the Our Jam sandbox/test environment. Obtain its secret key beginning `sk_test_`, or a restricted sandbox key beginning `rk_test_` with permissions required to create hosted Checkout Sessions with inline prices/products. Store it as `STRIPE_SECRET_KEY` in the development Render service's Environment settings. The app supports restricted keys; validate permissions with a real sandbox checkout before relying on one.
2. Open https://dashboard.stripe.com/webhooks in the same sandbox. Create an event destination for the development origin followed by `/api/webhooks/stripe`. Select `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`, and `charge.dispute.created`.
3. Reveal that destination's signing secret, beginning `whsec_`, and store it as `STRIPE_WEBHOOK_SECRET` in the development service. It is separate from the API key. No publishable key is needed for the current hosted Checkout redirect integration.
4. Use sandbox test cards only. Keep live-payment acknowledgment unset. Real cards/charges are not part of development acceptance.

The platform admin page at `/admin/commerce` reports missing credential names, payment mode, webhook endpoint/events and OAuth callback URLs. It never reveals secret values. Prices and sponsor videos can be managed there. Price points remain the owner's commercial decision; fixtures use test rates only.

## Google and email

An isolated Neon Auth branch named `dev-commerce-identity-acceptance` is provisioned in the existing Our Jam project. Its default Google provider uses Neon's shared development credentials and its default email provider is shared. These are available for development without a new owner OAuth secret or SMTP account. They do not establish successful user authentication until tested.

For production branding, open https://console.cloud.google.com/auth/branding and configure Our Jam's app/support details. Open https://console.cloud.google.com/auth/clients and create an OAuth client of type **Web application**. Copy the exact authorized redirect URI from the admin setup panel or Neon provider configuration dialog. For the isolated acceptance branch it is:

```
https://ep-tiny-lab-b5x16bij.neonauth.c-7.us-east-2.aws.neon.tech/neondb/auth/callback/google
```

Then open https://console.neon.tech → Our Jam → `dev-commerce-identity-acceptance` → Settings → Auth → Google → Configure. Enter the Google Client ID and Client Secret there, not in frontend code. Add the actual application origin to trusted domains. If the Google consent app remains in Testing, add the specific test accounts to its audience. Keep development and production configuration distinct.

Optional GitHub sign-in requires an OAuth app at https://github.com/settings/developers and its Client ID/Secret in the same Neon branch; use its exact `/callback/github` URI. Enable `AUTH_SOCIAL_PROVIDERS=google,github` only after configuring both providers. Production email settings/custom SMTP are configured in Neon Auth; the application's release-email settings are a separate feature.

## Acceptance already performed and still required

The acceptance database received commerce/identity/native migrations 009–011 plus `009_platform_vote_policy.sql`, with restricted runtime grants (twelve records total). Runtime login has no schema creation, migration-history write, superuser, role creation, database creation or RLS bypass. Production and active rehearsal migrations/settings were not changed. A private acceptance media bucket is separate from rehearsal media.

Hosted development readiness, private media round-trip, real bootstrap administrator/performer login, restoration, role isolation, logout/replay denial, setup diagnostics, and actual sponsor upload/private preview/publish/unpublish/silent decoding passed on October 17. See [the current acceptance evidence](progress/2026-10-17-development-acceptance.md). Real owner Google/email verification/reset, Stripe sandbox checkout/verified webhook/refund, hosted song countdown/pause/reconnect and physical iPhone/Android checks remain pending. Fixtures and public OAuth initiation do not prove successful account sign-in or email delivery.

References: https://neon.com/docs/auth/guides/setup-oauth ; https://docs.stripe.com/keys ; https://docs.stripe.com/webhooks .
