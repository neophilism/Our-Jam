# Our Jam

Live music made together. Fans contribute **Sound Waves**, move five votes among them, and help shape the crowd's next release.

## Run the real zero-budget rehearsal

The native iOS Simulator app and persistent local API have passed native-to-public-screen acceptance. The accepted artifacts and exact test runs are in [PROGRESS.md](PROGRESS.md). This is real user data, not a seeded demonstration, TestFlight distribution or a hosted public event.

On your Mac, install Node.js 24 and FFmpeg/ffprobe. Xcode with an installed iOS Simulator runtime is needed only for the native app; the browser and monitor routes do not require Xcode or Apple membership. Double-click **Check Our Jam Setup.command** to check prerequisites, then **Start Our Jam.command**. From Terminal the equivalent is:

```sh
bash "Check Our Jam Setup.command"
bash "Start Our Jam.command"
```

The launcher installs locked dependencies when necessary and opens `http://127.0.0.1:4173/performer`. TextEdit shows your locally generated private performer key. Paste it into sign-in; do not share it. Create your event, enter song titles and private core prompts, and attach your actual MP3/WAV files in **Upload album audio**. Keep the original masters: uploads make validated MP3 playback copies.

Use **Open monitor window** in the performer console. It opens the existing `/screen/:slug` renderer, not a preview or another event. Drag that same window onto the external monitor and use the browser's full-screen control. The panel supplies the exact server address and event code for the native app.

Extract the accepted `OurJam-Simulator.zip` beside **Open Simulator.command**, then run that launcher. Enter the same server address and event code. The event code and the restricted voting room code are different. Start/resume playback in the performer console, join from the native app, submit a Sound Wave and see it appear on the public display. Nothing is added automatically.

For an immediate first test, set **Minimum participation seconds** to 0 before opening the round, or wait the configured minimum before closing it. Mureka / Stable Audio is a two-button selector for future rounds. The real job processor records **approved_budget_zero** before any provider request. Tags and votes are not rejected because of the budget. No provider error or audio result is fabricated.

Data persist under `~/.our-jam-local`. First dependency installation needs internet; subsequent unchanged installs are reused. Keep the server terminal open. [Detailed local instructions](docs/local-real-rehearsal.md) describe storage, startup and recovery limits.

## Boundaries

The local server is reachable by this Mac and its Simulator, not separate audience phones over Wi-Fi. Its localhost QR cannot onboard a remote crowd. A free-tier HTTPS rehearsal API is live at https://our-jam-rehearsal.onrender.com; external health/readiness checks have passed, but actual private media round-trip and real phone/venue acceptance are separate gates. See [deployment](docs/deployment.md).

Both adapters generate from the saved core prompt plus selected Sound Waves, not the uploaded waveform. Both local spending limits are hardcoded to $0 and ignore outside provider configuration. Funded comparison requires a new explicit allowance, API credits and verified server-side pricing/rights configuration. `MUREKA_API_KEY` and `STABLE_AUDIO_KEY` are supported secret names; GitHub secrets are not automatically Render environment variables. There is no automatic Thursday activation.

A Simulator `.app` is not a TestFlight `.ipa`. TestFlight requires membership, appropriate signing/submission access and store acceptance. The separate Expo draft remains security-blocked; this SwiftUI target does not complete Android or all native V1 features.

## Development

Read [AGENTS.md](AGENTS.md), [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), [PROGRESS.md](PROGRESS.md) and the [54-work-package canonical register](registry/prs.json). Original dependencies and acceptance remain in [backlog.json](backlog.json). DJ V2 and the secondary demonstration have separate plans. Use `npm ci` and `npm run check`, plus applicable browser/native checks before merging.

After all application checks, audit, production builds and Docker pass, CI preserves a source-only release with its commit and checksum. Native artifacts have their own Simulator gate. See [release packaging](docs/release-packaging.md); a source ZIP never claims to be an installable iOS binary.

## Project resources

GitHub `neophilism/Our-Jam`; Render project `prj-db5btotckfvc739m1ck0`; Neon project `crimson-hat-87508124`; production branch `br-aged-sea-b55fzq0v`; isolated rehearsal branch `br-blue-unit-b5rk1hit`.

Never reuse unrelated credentials/services or commit secret values. Artist core prompts and unpublished recordings stay private. The server-authorized architecture is not an end-to-end-encryption or independent security certification claim.

## End-to-End Everywhere progress

The canonical [security/e2eesa-status.json](security/e2eesa-status.json) records standard implementation, complete testing and independent expert review separately. Engine Room reads it automatically from GitHub. All initial stages are pending; existing profile locks and approved decisions remain authoritative. Read [adoption and independent-account instructions](docs/E2EESA_ADOPTION.md), and run `python3 scripts/validate_e2eesa_status.py`. Record validation does not establish product security or certification.
