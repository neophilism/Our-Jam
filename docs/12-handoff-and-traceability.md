# Implementation handoff and requirement coverage

## Inputs for the next session

The user intends to supply GitHub, Render and Neon project links and then request implementation. Those links identify destinations but may not grant API access. Inspect available connectors and repository permissions, use project-scoped secrets through the proper configuration mechanism, and never ask the user to paste private credentials into public files or commit them.

| Input | Why it is needed | Does it block all work |
| --- | --- | --- |
| GitHub repository and Render/Neon project links | Ground the real project and deployment targets | Blocks repository/deployment work until accessible |
| Album files, source-track order and core prompts | Preserve the artist's signature and actual timing | Fixtures can support development; real acceptance needs these |
| Artist name, artwork and album purchase URL | Public experience and QR destinations | Does not block backend work |
| Preferred generator or approved provider account | Entitlements, rights, latency and cost | Does not block isolated domain work; blocks live generation |
| Approved spending cap and existing ancillary resources | Object storage, email, generation and hosting costs | Blocks new paid provisioning only |
| Exact Rave model, port photos and playback computer | Determine recording and cue compatibility | Blocks hardware claims, not voting work |
| Expected crowd size, screen and venue connectivity | Set capacity and visual presets | Use provisional 100-person design profile until known |
| Full security standard and Engine Room access | Verify exact standing requirements and track project | Work on known baseline; withhold unsupported compliance/tracking claims |
| Apple/Google developer accounts | Native signing and distribution | Does not block the QR web app |

Routine architecture decisions already have recommended defaults in this package. Do not pause for a product name, color palette or minor library choice when it is possible to proceed safely with the working design. Ask only when the missing information changes rights, spending, identity, destructive actions or a material product requirement.

## Credential and configuration inventory

Document names and purposes only: application session signing secret; database pooled and migration connection references; object storage bucket, region and scoped keys; music provider key and model entitlement; webhook signing secret where used; email sender/domain and API key; web-push VAPID key pair; native APNs/FCM or Expo configuration; observability DSN; deployment identity; and store-signing references. Never commit values. Some providers lack webhooks or job lookup; capability flags must reflect the actual API.

Separate environment-specific URLs and credentials. Reconcile the supplied Render and Neon resources with their intended project before any write. Do not assume a link is permission to change an unrelated application or database. Verify git status and AGENTS.md in the real repository before importing this plan, preserving existing work.

## Requirement traceability

| User requirement | Specification and implementation |
| --- | --- |
| Phone-first audience collaboration | 01 and 03; P005, P009, P012, P032–P035 |
| Sound Waves and five movable votes | 02; P009–P010 |
| Own submission consumes a point and disappears at zero | 02; P009–P010 |
| Votes drive display and prompt order | 02 and 04; P013, P015, P029 |
| Core prompt remains part of every generation | 04; P006, P015 |
| Track-end automatic submission and limited generation | 04; P008, P014–P015 |
| Common release moment and honest generation delay | 04; P016, P019 |
| Cinematic beat-responsive 3D waves | 03; P013, P028–P029 |
| Venue-specific display cap and full visual field | 03; P013, P029 |
| Mobile-optimized visualization | 03; P012, P033 |
| Free and buy QR codes | 01; P013, P024 |
| Immediate free listening and downloadable archive | 04 and 06; P016–P017, P024, P039 |
| Likes, dislikes, comments and listening prompts | 06; P017–P018 |
| Live performer play/like monitoring and queue insertion | 01 and 05; P020–P021 |
| Headphone cue separate from speaker | 05; P021 |
| Karaoke mic recording and playback timeline | 05; P002, P022, P037; exact hardware gate |
| Email plus app/web notifications | 06; P019, P035; verified contact and opt-in |
| Names, avatars and anonymity | 02; P005, P023 |
| Artist-specific time-window leaderboards and awards | 02; P023, P030 |
| Remote audience and ongoing fan growth | 01; P024, P031 |
| Cross-platform iOS and Android production | 06 and 07; P032–P036, P042 |
| Distributor integration later | 04; P039; no instantaneous DSP claim |
| Separate DJ V2 | 10; D001–D008 |
| Secondary keyboard demonstration | 11; M001–M004 |
| Autonomous chained PRs and safe merges | DEVELOPMENT_PLAN.md and AGENTS.md |
| Self-contained plans, security, production and tracking | P001, P004, P025–P027, P041–P042 |

## Definition of complete

Every declared feature has implementation, relevant test evidence, operator documentation and a supported device/provider matrix. The actual production URL and deployed SHA are recorded; smoke tests pass; secrets and data remain project-scoped; the artist can run the show and recover from anticipated failures. Native store delivery is confirmed, not inferred from an Expo build. Record any accepted limitation explicitly.

After each merge, update progress and Engine Room if connected, resolve the next eligible PR and continue during the active work session. A blocked external provider, store review or hardware dependency does not prevent independent work. Do not report work continuing in the background after the session unless it actually is.

