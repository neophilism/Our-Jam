# Run the real system on one Mac without paid services

This is an explicit single-Mac deployment of the actual API, performer console, audience client and public screen. It uses disk-persistent PGlite PostgreSQL and private local audio files, not a mocked API, seeded crowd or simulated generation. It is not the separate demonstration workstream. It does not recreate a denied Render operation or connect to production Neon data.

## Start

Install Node.js 24 and FFmpeg (both free). On a Mac with Homebrew already installed, FFmpeg is `brew install ffmpeg`. Unpack the complete source bundle and double-click `Start Our Jam.command`. It installs locked npm packages when needed, builds the actual application and starts it on http://127.0.0.1:4173. Keep its terminal open. The browser opens /performer, and TextEdit opens your locally generated performer key. Paste that key into the performer login. Never share it or commit it.

Create a session using your real song titles and private core prompts. In Upload album audio, attach the actual MP3/WAV to each unplayed source. Open the session's Public screen in its own browser window. That is exactly the /screen/:slug route used by an external display; drag that window onto the monitor and use browser fullscreen. Run the actual iOS Simulator app, enter http://127.0.0.1:4173 and the same event code, join with the room code if enabled, and contribute. Start/resume playback in the performer console so voting opens. The stage and native app reflect the same persisted event.

The server always uses a hard $0 event/total generation budget and no provider credentials, regardless of external environment values. Closing a supported round records approved_budget_zero before any attempt or cost reservation. It does NOT fake an upstream insufficient-credit response. Mureka/Stable Audio selection is still saved per round for inspection. To exercise billable live generation later, use the reviewed hosted configuration and explicitly approved budgets, not this zero-budget local script.

Your data persist in ~/.our-jam-local/database and audio/. The performer key is performer-key.txt. These files are private OS-permission-protected but not application-encrypted; use a trusted Mac with disk encryption and backups. The server binds only 127.0.0.1 and serves signed short-lived audio URLs. It is not reachable by other audience phones over Wi-Fi. It cannot replace a verified hosted deployment for a public show.

## Native simulator

The OurJam-iOS-Simulator CI artifact contains a genuine .app archive. Extract it and place OurJam.app beside apps/ios/Open Simulator.command, then run that script. It needs Xcode and an installed compatible iPhone Simulator runtime. It does not need Apple Developer membership. A simulator binary cannot be uploaded to TestFlight; the later production archive needs membership and signing.

## Limits

No new cloud service, paid plan, email or music generation is used. Local uploaded playback copies are MP3 derivatives, not master backups. The local audio store caps files at 1 GiB; old private files are retained for explicit cleanup. This is single-process rehearsal, not venue-load, physical-phone, physical-output or cloud-storage certification. Native Android, full native feature parity and store acceptance remain open. Existing tests remain required; deployment or artifact claims need observed results.
