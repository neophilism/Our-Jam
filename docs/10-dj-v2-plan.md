# DJ version development plan

## Separate product scope

V2 gives the DJ control over when a musical round ends. Track-file boundaries no longer necessarily match creative transitions. The DJ may loop, mix two tracks, extend an instrumental, cue a crowd result and close a round at the chosen moment. V1's album-release behavior remains a supported mode with its own tested semantics.

The primary V2 controls are Open round, Set closing countdown, Close and generate, Hold and Cancel. Closing freezes the current crowd decision once. The DJ's close command is not a request for instant finished music; generation and release remain asynchronous. Ready tracks appear in the DJ's cue library and can be brought into the set later.

## Crowd and prompt design

Show “Voting open — DJ decides the next drop” while no deadline is set, then show a countdown only when the DJ declares one. Preserve a minimum audience participation window. An early close requires a deliberate override with a visible reason or cancellation policy, preventing accidental button presses from spending money and cutting participation short.

Each round has an explicit source core: one album track, a DJ-authored set core or a rights-cleared blend of selected sources. BPM, key, energy and duration may be constrained by the DJ. The crowd still votes on Sound Waves; votes cannot bypass those locks. Changes to the mix affect the next snapshot, never an already submitted generation.

## Integration boundaries

Start with manual DJ boundary controls and a verified audio input/recording route. Add one actual supported DJ software or hardware integration at a time after inspecting its published SDK/API, MIDI, OSC or supported metadata mechanism. No particular commercial DJ package is assumed to expose deck audio, track identity, licensing permission or secure remote control.

Beat synchronization, source identity, actual audio routing and generation boundaries are different signals. A MIDI clock can help animate beats but does not identify the legally usable source recording. A crossfade midpoint is not automatically the audience deadline. Keep DJ intent explicit and record the set timeline for later attribution and recording alignment.

## V2 acceptance

A DJ completes an unpredictable live set with loops, crossfades, early changes and network trouble. The crowd understands when it can vote; each close yields one immutable generation; cue never leaks; existing decks keep playing through a backend outage; and exports preserve the relationship between source rounds, generated music and the final recorded set. Supported software/hardware combinations are named in release notes.

The eight PRs appended below depend on complete V1. The standalone demonstration track is documented separately and does not supply substitutes for V2 live acceptance.


## D001 DJ round and performance segment model

Dependencies: P042.

Scope: Define performer-controlled rounds independently of file ends, eligible source anchors, minimum participation windows and one-time close commands.

Acceptance: Loops, crossfades and multiple source tracks have an explicit core prompt; only one close triggers generation.

Verification: State-machine tests with loop, seek, early close, replay and stale commands.

Rollout: Feature flag DJ event type; album-release V1 semantics remain versioned.

## D002 DJ controls and boundary gestures

Dependencies: D001.

Scope: Add Open round, Close and generate, Hold and Cancel controls, performer shortcuts and optional MIDI mappings.

Acceptance: The DJ can close once during a transition without accidental repeated charges; crowd sees clear round state.

Verification: Rapid repeated controls, MIDI bounce, accidental tap undo rules and lost-controller tests.

Rollout: Hardware controls require deliberate mapping and an emergency disable.

## D003 External decks timing and audio bridges

Dependencies: D001, D002.

Scope: Implement one documented DJ integration selected from actual available SDK, MIDI, OSC or playback metadata; add manual bridge where no supported integration exists.

Acceptance: Metadata, beat clock and performer boundaries have explicit authority and licensing; no claim of universal DJ-software support.

Verification: Actual target software/hardware and reconnect tests; verify control and audio clocks separately.

Rollout: Manual boundary mode always available; integration-specific feature flag.

## D004 Mix-aware prompt and generation policies

Dependencies: D001, D003.

Scope: Support selected source cores, DJ tempo/key constraints, bounded mixtures and optional preapproved reference audio.

Acceptance: Crowd additions preserve DJ locks; changing the mix does not mutate already submitted prompts.

Verification: Prompt lineage, conflicting keys, multi-source rights and rapid-transition tests.

Rollout: Reference audio and optional provider features remain gated by entitlement.

## D005 Two-deck preview and performance queue

Dependencies: D002, D003, D004.

Scope: Add preview decks, next-slot placement, cue markers and approved crossfade controls with separate public and cue buses.

Acceptance: The DJ can audition and bring a crowd output into the mix without leaking preview or duplicating a queue item.

Verification: Real mixer/interface routing, last-second transitions and missing-asset fallback rehearsal.

Rollout: Keep original deck playback authoritative; instant live synthesis is not promised.

## D006 DJ crowd display and release timing

Dependencies: D004, D005.

Scope: Adapt display progress for open-ended rounds, DJ-triggered countdowns, stage transitions and ready-result release controls.

Acceptance: The audience always knows whether voting is open; a loop or crossfade cannot silently close the round.

Verification: Variable-length rounds, prolonged holds, countdown cancellation and result-ready E2E.

Rollout: Clear non-countdown state when the DJ has not set a deadline.

## D007 DJ recording and set lineage

Dependencies: D005, P037.

Scope: Capture supported mixer or interface outputs, preserve cue isolation, segment the set and maintain source and contributor lineage.

Acceptance: Recorded set and separate generations have correct rights and timestamps; unsupported deck signals are labeled.

Verification: Long-set drift, recording recovery, consent and export inspection.

Rollout: Private capture until explicit set-release workflow completes.

## D008 DJ production release and field acceptance

Dependencies: D001, D002, D003, D004, D005, D006, D007.

Scope: Run actual DJ session with unpredictable transitions, crowd participation, network failure and provider slowdown.

Acceptance: DJ version passes independent operational gates without regressing album V1.

Verification: Hardware-in-the-loop rehearsal, cross-platform regression and event recovery run.

Rollout: Release as V2 with supported integration matrix and rollback.


