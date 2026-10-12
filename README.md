# Our Jam

Live music made together. Fans contribute **Sound Waves**, move five votes among them, and help shape the crowd's next release.

## Run the real zero-budget rehearsal on your Mac

The actual native iOS Simulator app and persistent local API have passed native-to-public-screen acceptance. Download the verified artifact linked in [PROGRESS.md](PROGRESS.md), or use the source checkout. This is real user data, not a seeded demonstration. It is not a TestFlight release or hosted public event.

Install Node.js 24, FFmpeg/ffprobe, and Xcode with an iOS Simulator runtime. The Simulator path does not require paid Apple membership. From this repository run:

```sh
bash "Start Our Jam.command"
```

The performer console opens at `http://127.0.0.1:4173/performer`. A TextEdit window shows your locally generated private performer key; paste it into sign-in without sharing it. Create your own event, add track titles/private core prompts, and upload your own MP3/WAV files. Choose Mureka or Stable Audio for future rounds. Use **Open monitor window** to open the existing `/screen/:slug` route in a separate window; drag that same window onto your external display.

Extract the accepted `OurJam-Simulator.zip`, place `OurJam.app` beside `Open Simulator.command`, and run that launcher. Enter the same server address and event code. The event code and restricted voting room code are different. Start/resume playback in the performer console, join from the native app, submit a Sound Wave and watch it appear on the public display.

For a fast first test, set **Minimum participation seconds** to 0 before the round, or wait the configured minimum before closing it. The local generation processor records the genuine `approved_budget_zero` block before any provider request; it does not reject tags, fabricate a provider error or insert prerecorded results. No keys or paid credits are needed for this loop. Data persist under `~/.our-jam-local`. See [full local instructions](docs/local-real-rehearsal.md).

## Funding and hosting boundaries

The localhost server is reachable by the same Mac's Simulator, not separate phones over Wi-Fi. The public display is real, but a localhost QR cannot onboard a remote crowd. Hosted deployment and real private Neon media delivery remain separate gates.

The current Mureka and Stable Audio adapters generate from the saved core prompt plus selected Sound Waves, not the original song's waveform. Both local budgets stay at $0 regardless of environment settings. Live provider comparison requires explicit nonzero authorization, usable API credits, current pricing/rights checks and approved server-side configuration. GitHub secrets are not automatically Render environment variables. See [dual-generation controls](docs/dual-generation.md) and [resource state](docs/rehearsal-resource-state.md).

TestFlight needs a separately signed production build and the owner's Apple membership/submission access. The existing Expo draft remains security-blocked; the independent SwiftUI Simulator acceptance is not Android or full V1 completion.

## Development and full plan

Read [AGENTS.md](AGENTS.md), [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), [PROGRESS.md](PROGRESS.md) and the [canonical 54-work-package roadmap](registry/roadmap.json). Original dependencies and acceptance remain in [backlog.json](backlog.json). DJ V2 and the secondary demonstration have separate plans. Use `npm ci` and `npm run check`; run all relevant browser/native gates before merging.

The system uses React, Fastify, PostgreSQL, a durable generation queue and the SwiftUI iOS target. Local rehearsal uses persistent PGlite. Hosted setup remains documented in [deployment](docs/deployment.md); read the newer resource reconciliation before acting on historical status text.

## Project resources

- GitHub: `neophilism/Our-Jam`
- Render project: `prj-db5btotckfvc739m1ck0`
- Neon project: `crimson-hat-87508124`
- Production branch: `br-aged-sea-b55fzq0v`
- Isolated rehearsal branch: `br-blue-unit-b5rk1hit`

Never reuse unrelated credentials/services or commit secret values. Artist core prompts and unpublished recordings stay private. The architecture has explicit server trust boundaries; no end-to-end-encryption or independent security certification is claimed.
