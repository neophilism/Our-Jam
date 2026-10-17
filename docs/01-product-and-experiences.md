# Product and participant experiences

## Product direction

The application should make every participant feel that their musical judgment can change what happens on stage. Its strongest loop is hearing the album, proposing a Sound Wave, watching support build, hearing the resulting track, and seeing the artist bring a crowd favorite into the show. The album supplies a coherent identity; the audience supplies variation; the artist retains performance control.

Build an artist platform with one excellent first artist experience. Use artist and event boundaries from the beginning, while postponing complex artist billing and marketplace discovery until the live loop works. Do not begin with a generic prompt box. The core interaction is a small, understandable game attached to the music currently playing.

## People and surfaces

| Person or surface | Main need | Essential experience |
| --- | --- | --- |
| Artist before the show | Prepare without engineering help | Upload album, add core prompts, arrange set, configure screen, rehearse audio and set spending cap |
| Artist during the show | Make fast decisions while performing | See current track, crowd favorites, generation status, private preview and Play next |
| Live participant | Affect the music quickly | Scan, join, contribute, vote for Sound Waves and see personal influence |
| Casual spectator | Understand without onboarding | Clear on-screen invitation, readable leading waves and two QR codes |
| Remote fan | Enjoy and contribute without being physically present | Artist event page, released tracks, credits, comments and clearly labeled participation rules |
| Returning fan | Maintain identity and recognition | Profile, automatic musical avatar, history, favorite artists and leaderboards |
| Moderator or crew | Keep the event usable | Hide abuse, resolve reports, manage display and monitor service health within a scoped role |

## Audience onboarding

The public screen has exactly two persistent primary codes: **FREE — Join and get the music** and **BUY — Support the album**. The free code opens the current event with no app-store detour. Its destination remains stable across tracks, and late arrivals can find every released track. The buy code points to the artist's existing checkout or storefront, using a separate measurable redirect. Print both codes and short URLs as a backup.

Start with a guest identity, an automatically generated musical avatar, and a brief explanation: “Suggest a Sound Wave—an instrument, rhythm or mood you’d love to hear. Vote for other people’s ideas, too. You can change your votes until the song ends.” The first interaction should be possible within about 20 seconds on the tested connection. This is a product target, not a measured result.

Offer name and avatar editing immediately without making them compulsory. Offer account recovery and an email field after the first contribution or listen: “Email me this event's free releases.” Verify the address before sending. Separate that choice from ongoing artist marketing. Native-app users can also request these emails. Do not require an email or app install merely to listen or download.

## Phone information architecture

The event has four primary destinations: **Live**, **Tracks**, **Leaders**, and **You**. A persistent mini-player shows a generated track if the fan chooses to listen. Live shows the album track name, remaining participation time, votes remaining, a personal Sound Wave, leading waves and a searchable list. A fixed lower control area makes voting stable even while the visualization moves.

Submission asks, “What would you mix into this sound?” Offer vocabulary such as instruments, rhythm, genre, mood, texture and production treatment. Use suggestions to teach, not to constrain all submissions. A short phrase like “muted trumpet” is easier to understand and pack into a prompt than a long instruction. Artist-configured exclusions and locked properties appear as simple guidance before submission.

Make the distinction between the live album and a headphone preview visible. Joining never starts phone-speaker playback automatically. When a new result arrives, show “Your crowd track is ready” with Listen and Download. A listener can keep voting while listening privately; the voting header still identifies the actual on-stage album track.

## Performer console

The desktop view keeps Now playing, Up next and Crowd favorites in view together. Phone controls use large single-purpose actions. Each released track shows unique qualified listeners, likes, dislikes, completion, recent activity and generation lineage. A low-sample label prevents two enthusiastic votes from looking like a reliable crowd verdict.

The fastest action is **Play next**. It queues rather than interrupts. Provide an immediate undo and a secondary “Choose position” action. Repeated taps cannot insert duplicates accidentally. Preview defaults to the performer's phone and connected headphones; desktop cue routing is an optional tested route. A visible cue indicator distinguishes preview from public playback.

The artist can hold a release, hide a result, cancel a stuck generation, stop accepting new waves, pause a round with playback, and use a “Continue album only” control. Public screens receive no administration secrets. A crew moderator can manage content without accessing recordings, billing or the set queue.

## Remote fans

Provide an artist page, upcoming and completed events, every public crowd release, the artist-selected album links, profiles that choose public credit and artist-scoped leaderboards. A show archive has a sequenced track list, source album track, selected Sound Waves, an explanation of the event and the artist's picks.

Default remote fans to listening, feedback and following. The artist may explicitly open remote voting before an event. If enabled, display that fact and apply the same per-song vote policy; optionally use separate local and remote rounds instead of silently discounting remote votes. A publicly shared QR is not proof of physical attendance. An event code can discourage casual remote entry but must not be described as secure location verification.

Live video or a low-latency audio broadcast is a later optional service, not a prerequisite for remote access to generated tracks. Broadcasting the original album requires an artist-controlled permission setting. Remote fans otherwise see now-playing metadata and released generations; do not imply they are hearing the street sound system in sync.

## Fan growth and music sales

Keep artist-selected music provider links present on the event, player, download receipt and artist page, with restrained copy. Add Follow artist, save to personal collection and future-event reminders when chosen. The crowd release is a companion to the original album, with its own name and clear lineage; the original record remains the reference point.

Measure the funnel from QR scan to first vote, first listen, follow, download and purchase-link click. Only call a purchase confirmed when a supported checkout integration supplies a valid confirmation. Do not equate clicks with sales. Track event-level retention and repeat attendance without requiring cross-site tracking.

Possible later artist revenue includes event subscriptions, production tools and supporter purchases. Do not sell extra votes or algorithmic advantages. Contributors should receive visible acknowledgment and a shareable receipt showing the waves that reached a released generation. Recognition is not a promise of copyright ownership, royalties or a commercial remix license.

## Community and release design

Treat each show as an evolving companion album. Assign each result a stable track number, title, cover treatment, source-track relation, selected waves and artist credit. Generate artwork deterministically from the event palette and waveform initially. Avoid additional image-generation costs in the live critical path.

Keep raw first-release files available when permitted. Distinguish the original crowd instrumental from a later recording with live rappers or an edited master. Publishing live microphone recordings requires its own performer consent and rights workflow; it is not implied by agreeing to contribute a musical phrase.

Prioritize cooperative recognition alongside competition: “Your wave made this track,” joint celebration at release and artist-picked moments. Show top contributors without shaming low-ranked participants. Do not label a person the “most considered” based solely on timing; use an observable name such as **Late breakout**.


## Current release voting policy

New artist-created shows can set how many **different Sound Waves** a fan may vote for (1–1,000). One vote per Sound Wave; selections are changeable until the song ends. Existing shows keep their frozen legacy weighted votes. All audience-facing marketing calls them votes, never 'points.' See [copy standard](copy-and-voting-language.md) and [game rules](02-game-and-ranking.md).
