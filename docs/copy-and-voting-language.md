# OurJam copy and onboarding standard

## What OurJam is

**Jam with the music you love.**

Imagine hearing a favorite song and helping create what it becomes next.

OurJam lets fans play with the possibilities inside an artist's **music itself**, together with everyone listening. When a song plays, listeners can add their own musical ideas to a shared creative space. Those ideas are called **Sound Waves**. A Sound Wave can be an instrument, a rhythm, a style, a mood, or an unexpected twist.

Share your Sound Wave. Discover the ideas other people are imagining. Vote on the Sound Waves you want to hear. When the song ends, the top-voted ideas can guide OurJam's music-generation tools in creating a new track inspired by that song's musical identity. Once the artist releases it, listen in the OurJam player and tell the artist which crowd-created tracks you love. Artists may choose to play a crowd creation during the show.

There is no requirement to play an instrument or produce music. People join with ideas.

**Accuracy:** Current generation is prompt-based: it uses the artist's private description of the original song and selected Sound Waves. Do not describe this as guaranteed literal audio-stem mixing, direct modification of the original recording, or performing alongside the artist. Not every participation round generates a track: provider setup, authorized budget, eligibility, and artist release controls determine availability. Never show a fictional preview as a real track.

## Terminology

| Word | Audience-facing meaning |
| --- | --- |
| **Sound Wave** | One short musical idea a listener submits during a song |
| **Vote** | Support for a Sound Wave; tap + to add one or − to take one back while voting is open |
| **Votes remaining** | How many votes the listener can still use on this song; the UI reads this count from the event snapshot |
| **Crowd-created track** | A generated track inspired by the artist's song and top-voted Sound Waves, available only if created and released |
| **Love it / Not my sound** | The listener's reaction to a released crowd-created track, distinct from voting on Sound Waves |
| **Artist's original album** | The independent artist's existing music linked through approved stores and listening platforms |

Don't call audience votes “points”, “credits”, “tokens”, “scores” or a currency. Don't say “five points” or repeat the technical allocation rule in marketing copy. Explain voting in context: **“Tap + to vote for an idea and − to take a vote back. You can change your votes until the song ends.”** Only show actual vote counts where users make decisions.

New artist-created shows use **one vote per Sound Wave**: a fan can choose as many different musical ideas as the artist allows, up to 1,000 choices per song. Fans may change their choices before the cutoff. A new Sound Wave uses one of the fan's votes. Existing shows and previously opened rounds preserve their legacy weighted voting behavior, where a fan may place more than one vote on one idea. Live Sound Wave votes and reactions to crowd-created tracks are separate.

## Control-specific guided tours

Each coachmark highlights the exact visible input or action it teaches. A tutorial about **the event code** must only explain entering the event code. A tutorial about **+ and − buttons** must explain casting and removing votes, not playback or release operations. The show page can explain the full experience; the step bubbles must not turn into essays. Skip controls that are hidden or unavailable and retain Back, Next, Skip and Replay. Tours never perform real submissions, purchases, playback, votes or releases.

## Editorial conventions

- Write for a first-time fan, not someone who knows the project's internal data model.
- Prefer verbs: **Listen**, **Share a Sound Wave**, **Vote**, **Hear the track**.
- Use direct examples such as “funky bass guitar” or “dreamy strings”.
- Avoid vague headlines like “The room has a sound” when a clear action can replace them.
- Do not equate a vote with a purchase or promise paid features on a zero-spend rehearsal environment.
- Always distinguish audience controls from artist-only audio/output/publishing controls.
- New text must work on mobile, be screen-reader understandable, and use plain-language error messages.

## Vote limits, compatibility and honest marketing

**New shows:** Artists can select how many **different** Sound Waves each fan may vote for on each song (1–1,000). The artist console defaults to five choices but never promotes a fixed five-point game. Each choice carries **one vote**. Once a song starts, its voting rules are frozen until the next song. The system's server-side allocation checks enforce both one-per-wave and the configured total; neither setting is trusted from a fan's browser.

**Previous shows:** Pre-existing rounds use their prior five-vote weighted model. A fan may allocate several votes to one Sound Wave only in those legacy rounds. Changing an old event to the one-vote-per-wave model takes effect only on its next round. The public snapshot includes the **actual** voting mode and count, and web/native clients render the right instructions.

**Database compatibility:** The existing `allocations.points` smallint column and check constraint (1–5 *per Sound Wave row*) remain safe for the new single-vote mode because every new-mode allocation row has value exactly **1**. The vote *total* can be larger since it is distributed across multiple rows. Do not loosen the existing constraint or silently reinterpret stored weighted votes. The existing 1,000-wave contribution capacity constrains high-choice shows; verify realistic crowd load before promoting a 1,000-choice event.

**Acceptance:** Tests must cover both modes and the legacy default, per-wave uniqueness, a ten-choice round, upper range of 1,000 distinct waves, wrong limits, atomic submission and transfer, competing tabs, paused/closed rounds, frozen rules, public round metadata, and mobile/desktop copy. This work does not authorize paid generation or new music licenses.
