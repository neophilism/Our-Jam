# Rehearsal release packaging

The normal application workflow publishes `OurJam-Local-Source` only after plan/type/application tests, browser tests, dependency audit, production builds and Docker all succeed. The ZIP is `git archive HEAD`: tracked source only, with its actual checkout commit and SHA-256 checksum. Untracked performer keys, databases, audio, local environments and generated test evidence are excluded. This adds no workflow secret, provider call or deployment permission.

The source archive contains the real local launcher, prerequisite checker, server, browser UI, public screen and native source. It does not contain Node, FFmpeg, Xcode, npm's installed packages, or an installable native binary. First use still needs the documented local prerequisites and internet for locked package installation.

The independent native workflow distinguishes `OurJam-iOS-Simulator-Compiled` from final `OurJam-iOS-Simulator`. Only the latter has passed actual native interaction and native-to-public-screen checks. Compiled-only artifacts must not be relabeled as accepted. Apple Silicon and Intel architectures may both compile while interaction evidence comes from only the recorded runner/device. Neither archive is TestFlight distribution.

When assembling a user delivery, preserve the native ZIP bytes and its checksum rather than re-signing or rebuilding on Linux. Keep source and native commit provenance explicit when packaging a newer checked server/launcher with an unchanged accepted native client. Validate compatibility; do not imply an unrun combined native test. The exact original accepted package remains available for reproduction.

CI fixtures explain screenshots and tests only. Do not seed them into user startup. Never include a real private song, core prompt, operator key, provider key, database URL, storage credential or recovery key in a release artifact. The $0 local runtime must remain intact. This packaging change advances existing release/rehearsal work, not completion of all 54 packages.
