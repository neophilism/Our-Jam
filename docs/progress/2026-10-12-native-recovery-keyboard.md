# Native recovery small-screen correction

Run 38250474750 attempt 2 reached the real UI. Native Sound Wave participation passed, but the new recovery/follow flow stopped because the profile keyboard remained focused after Save and a whole-screen test swipe hit the keyboard rather than the Form. The accessibility hierarchy showed the name field still focused with the keyboard covering the lower controls. This was not a provider-credit or API authentication error.

Save profile now clears an explicit SwiftUI FocusState. Profile and connection Forms support interactive keyboard dismissal. The native regression asserts that Save actually dismisses the keyboard, then reveals lazy Form controls with bounded gestures in the content area and retains all profile/follow/key/restoration assertions. It does not skip recovery or substitute API-only checks for native interaction.

The prior initial run's AX daemon startup failure and the later actual UI failure are distinct. No further blind rerun is used. Fresh exact-head compilation and native recovery-to-stage acceptance are required before release. This changes no database, paid resource, cloud deployment, provider request or session-authorization policy.
