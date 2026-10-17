# Guided tutorials

The web homepage, audience room, performer sign-in/setup and private performer console each have a dedicated guided walkthrough. A visible header button says **Take a tour** for new users and **Replay tour** afterward. The walkthrough points to the real screen regions and provides Back, Next, Skip, Finish and Escape dismissal.

**Safe behavior:** These tutorials never join a room, submit Sound Waves, allocate votes, start playback, change show settings, publish releases, spend money or trigger performer actions. Only rendered DOM regions are included in a tour, so empty or unavailable areas are not misrepresented. The live public-screen renderer does not gain a tutorial overlay.

**Privacy:** Completion is a local browser setting per surface, versioned under the prefix our-jam-tour-v1. No API calls, account identifiers, event codes, telemetry or profile data are stored by the tutorial.

**Accessibility:** Keyboard focus stays inside the labeled tutorial dialog, Escape exits, focus returns to the launch control, spotlight follows resize/scroll, the mobile launch control has a spoken label and 44px hit area, and reduced-motion preferences are honored. Existing inline instructions and technical runbooks remain available.

**Validation:** Browser tests cover fan and performer first-run/replay, the actual vote-panel and playback anchors, keyboard dismissal and progression. Run all standard application, desktop and mobile checks before merge. Actual physical-device/venue accessibility remains a separate acceptance gate.

**Native follow-up:** SwiftUI/Expo native clients still require platform-native coachmarks and actual VoiceOver/TalkBack/device acceptance. Web tutorial completion does not imply native tutorial support.

**Rollback:** Remove the GuidedHelp component insertion from the shared Header and remove its two files. No server data or schema changes are made.

For a first visit to each supported screen, a non-blocking introduction offers **Start guided tour** or **Not now**. Dismissing the invitation remembers that choice locally, while **Take a tour** remains accessible. The tour does not open a disruptive dialog automatically during an active concert.
