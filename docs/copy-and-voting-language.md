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

A listener can currently cast multiple votes for one Sound Wave and can redistribute those votes. Posting their own idea uses one vote. Live voting and reactions to completed crowd-created tracks are distinct features.

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

## Vote-limit implementation debt (not changed in this copy release)

The actual current voting allowance is **five votes per listener, per song**. This is not just marketing text; the server's domain constant, Zod input upper bound, and the database's \`allocations_points_check\` constraint currently enforce five. This release **does not silently relax those safety checks**. The public snapshot now exposes the authoritative \`round.voteLimit\` so web and iOS displays derive their “votes remaining” count rather than hard-code promotional numbers.

To support artist-selected limits such as 5, 10, 100, or 1,000 in a future release:
1. Add a reviewed, staged schema migration relaxing the legacy \`allocations.points\` constraint while preserving all existing votes and history.
2. Add an artist-owned \`votesPerListener\` setting with bounded validation, snapshotted into each new round so an active song never changes mid-vote.
3. Enforce the immutable per-round allowance in the server allocation and contribution transactions; do not trust client-supplied limits.
4. Update the contract upper bound, native/web displays, performer setup, accessibility strings, and the one-vote automatic contribution rule.
5. Test the full range, simultaneous voters, 1,000-wave capacity, reversals, multi-tab conflicts, and realistic attendance/performance. Keep all existing event settings backward compatible.
6. Rehearse migration on the isolated staging database, separately review any operational permissions, then deploy when the exact-head checks pass.

There are no new purchases, accounts, database changes, or paid generation actions in this copy rewrite.
