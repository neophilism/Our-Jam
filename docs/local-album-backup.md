# Local album backup

Before a show, open its performer console and choose each original audio file in **Your local album backup**. Files remain in this browser's IndexedDB; they are not uploaded. Each file is limited to 100 MB and twenty minutes, must expose a finite duration in the current browser, and is saved with a SHA-256 checksum. A duration difference greater than two seconds is shown for review. This is a local file selection workflow, not a claim that remote album URLs have been downloaded or fully decoded.

Keep the console open. Playing a backup pauses the live audio element, clears its local playback lease and makes a bounded attempt to release server control. If disconnected, the server pauses audience voting when the former 25-second lease expires. An in-flight command may already have reached the server; backup mode cannot roll it back. Late control responses do not reclaim local ownership.

The backup sequence captures the visible source-track order when started. If enabled, it continues through that order using local files even without internet. Missing or checksum-mismatched files stop progression with an error. Generated tracks are not part of this album backup. Backup playback never advances the online queue, closes rounds or submits generation jobs. The artist must explicitly stop backup, reconnect and reclaim live control to resume audience participation. The recording timeline marks backup tracks as `local-backup:<source-id>`.

Browser playback permission can still require pressing the local audio player's Play button. The backup and normal player cannot intentionally play together. Private preview is disabled on the backup-playing device; use a separate headphones device. Output-device routing is not provided by this increment.

Files survive an ordinary online reload. Offline console reload is not supported yet. Requesting persistent storage is optional and may be refused; keep original files and export recordings promptly. Local files are readable by the device owner and same-origin code, are not encrypted, and can be removed individually. Changing browsers/devices does not transfer them.

Browser acceptance exercises actual synthetic WAV decoding and playback, reload persistence, live-control release, two-track continuation with the network disabled, an unchanged online queue and rejection of a corrupted stored file. Recording coverage chooses a synthetic input and verifies exact input constraints. These checks do not substitute for iOS/Android hardware, output routing, long-session storage, or venue rehearsal.

No migration, provider, email or new infrastructure is required. Rollback removes the controls without deleting locally stored files; export recording data before clearing this site's storage.
