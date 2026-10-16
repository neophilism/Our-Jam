# Artist-selected album purchase and listening destinations

An independent artist can add multiple **artist-supplied HTTPS links** per show, selecting recognizable music providers (Bandcamp, Apple Music/iTunes, Amazon Music, Qobuz, Beatport, 7digital, Spotify, YouTube Music, Deezer, TIDAL, SoundCloud, or another artist store). A provider-specific hostname must match the selected provider, including subdomains, and duplicate provider choices are rejected. The system never auto-generates links or assumes a platform has distribution rights. Streaming destinations are accurately presented as listening services; they are not represented as purchases.

## Routing policy (per event)

The artist selects either **Show all my providers** (default) or **Go directly to one preferred provider**. In direct mode, the preferred provider must appear in the artist's configured list; stale, omitted or invalid selections fail closed during event creation or settings edits. The policy is stored in the event settings and editable later. Legacy single purchase URLs remain viewable as a custom store until changed.

**Audience:** The album button on the show page, archived artist card, venue QR code and `/buy/:slug` route follow this policy. Menu mode presents the list and leaves the decision to the listener; the venue QR points to the stable same-origin `/buy/:slug` menu. Direct mode opens the approved preferred external HTTPS URL without a provider-choice step; the venue QR can point directly to that URL. A direct-mode visitor entering `/buy/:slug` receives a client redirect after public configuration resolves.

Only links chosen by the signed-in artist are shown. URL validation is repeated when public settings are read. No payment information, identity tracking or music licensing/payment automation is added. Outbound links are distinguished from OurJam and use `noopener noreferrer` to protect the opener. No schema migration is needed because the choices are stored in the pre-existing JSONB event settings.

Acceptance requires isolated unit/schema tests, permission and stale-revision checks, Playwright desktop/mobile for both modes and provider toggling, and the existing application/production-build/rehearsal gates. Real-provider buying is external; CI must never submit a purchase.
