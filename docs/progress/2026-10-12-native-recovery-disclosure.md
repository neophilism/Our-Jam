# Stable native recovery disclosure - October 12, 2026

Run 38260905467 reached the real iPhone SE Simulator. Profile editing, keyboard dismissal, following and key creation passed, but the key disclosure disappeared before the fan could press its save confirmation. Native contribution/voting passed separately. Compilation and the earlier onDisappear-only adjustment did not fix this acceptance failure.

The recovery-key state and sheet presenter now belong to the stable profile NavigationStack, not a lazy Form section whose rows change after issuance. Account status refresh finishes before presentation. The key is transient screen state; no clipboard, preference, file, URL or log persistence is introduced. A lifecycle epoch, captured API identity and event fence prevent a late response from showing after departure, backgrounding, disconnect or server/event changes. Actual scene inactivity still erases the disclosure. The confirmation remains outside scrollable text, reachable on a small screen and with larger text.

The real native regression now requires the same key to remain visible through a complete snapshot-refresh interval, requires a hittable save confirmation, and requires explicit dismissal before relaunch/restoration. Existing profile/follow recovery and native-to-stage assertions remain mandatory. Swift syntax parsing passed locally; exact-head application and actual Simulator CI remain the release gates, not predeclared successes.

The user explicitly requested another free Render creation attempt. The normal Render create_web_service tool again rejected the dedicated, zero-budget rehearsal service before creation. No alternate route, paid resource, provider request, email or production migration was attempted. Existing isolated Neon rehearsal data remain separate from production. This fix does not claim to remove the cloud deployment gate.

Advances OJ-031/OJ-032 within PR30. Reverting these UI changes does not delete profiles, follows or stored key hashes. Physical devices, full native parity and store distribution remain separate acceptance.
