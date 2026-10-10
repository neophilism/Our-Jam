# Audio playback and recording

## Recommended first production setup

Use the laptop for local album playback and show control, a wired output into the speaker's supported input, and a second screen for the public visualization. Use the artist's phone with wired or Bluetooth headphones for previewing generated tracks. The phone controls the queue remotely while its preview stays local. This gives rapid auditioning without depending on a browser's ability to address two different outputs.

Preload the original album and a known-good backup playlist before doors open. Decode or prepare the next item ahead of each transition. Keep networking, generation, analytics and rendering outside the audio scheduling path. If one laptop runs both projection and playback, enforce rendering limits so the scene cannot starve audio processing.

## Soundcore hardware uncertainty

The user specified an Anker soundcore Rave with two microphones, but the exact model is unknown. Official Rave 3S material lists an AUX input, a microphone/guitar input and a USB-C charging port [S7]. Those inputs do not establish a microphone recording output or USB audio interface. Older Rave variants have different connectors. Verify the model label, port diagram and an actual capture test; do not infer audio-out capability from the product family name.

If the bundled wireless mics terminate only inside the speaker and no documented mixed-output path exists, an application cannot extract their clean signal over ordinary speaker Bluetooth. No software sprint fixes a missing hardware path. The practical alternatives are a room recorder for the first show, a verified mixed output if this exact model provides one, or external microphones/receivers routed through an audio interface or mixer.

## Supported recording tiers

| Tier | Captures | Conditions and claims |
| --- | --- | --- |
| Room record | Speaker, voices and audience through a phone or recorder | Honest reference recording; includes room sound and may distort |
| Stereo mix | Music and microphones in one hardware mix | Requires an actual record output or interface input; cannot later isolate voices perfectly |
| Multitrack | Clean backing bus and one or two vocal channels | Requires separately routable mic sources and sufficient interface inputs |

Full V1 supports tested input devices and stores the source tier on each recording. Clean capture of the bundled Rave microphones is not an unconditional compatibility claim. If the first event uses room capture, label it a reduced recording tier, and keep the full microphone-input requirement open until supported hardware is tested.

For multitrack capture, two mic channels plus a stereo backing path may require four input channels or an interface with a verified loopback path. Keep mic monitoring in hardware when possible to avoid delayed self-monitoring. Match levels correctly; do not connect speaker-level outputs to a line or mic input. No hardware purchase is authorized by this plan.

## Audio routing rules

Public playback, private cue and recording are separate buses. The performer hears cue audio only through the selected device. Recording a backing bus must not capture a private preview by accident. A source-routing diagnostic plays unmistakable test sounds through each output and requires the operator to verify them before show mode.

Desktop browser output-device APIs vary; AudioContext.setSinkId is not universally available [S8]. Offer a same-laptop cue route only on the exact verified OS/browser/interface combination. Otherwise use the phone preview. Full V1 may add a signed desktop capture companion if browser routing or long recordings fail the hardware tests; this is an evidence-based decision in P037, not an assumed requirement.

Bluetooth playback can introduce latency and route changes. Prefer wired main playback when available. Use Bluetooth headphones for private preview if convenient, since cue timing does not control the public beat. Do not promise two Bluetooth destinations or mixed-microphone capture on iOS or Android without an actual supported route.

## Recording implementation

Request microphone access only when the artist arms recording. Show selected input, channels, sample rate, input meters, clipping indicators, elapsed time, free local space and upload state. Capability-detect codecs and input channels; do not assume every browser records the same container or channel arrangement.

Write short recoverable chunks locally with sequence numbers, time anchors and checksums, then upload opportunistically. Keep a local manifest and a completion marker. Resume uploads after interruption and assemble server-side only when checksums and chunk order pass. Do not keep a whole performance in RAM. Detect storage pressure early; browser storage is not an unlimited or guaranteed recording medium.

Record the exact public queue timeline, source file hashes, starts, seeks, pauses and fades. Capture audio and timing against one clock when possible. Separate devices drift; allow a calibration marker and post-session alignment, and never claim sample-accurate reconstruction from unrelated phone clocks.

A recording remains private by default. Provide download of raw captured files and an editable event manifest before adding automated mastering. Publishing live rap takes requires a distinct release workflow with performer permission and applicable rights information. A generated backing track's public status does not automatically publish a microphone recording.

## Failure and acceptance tests

Test a continuous session at least as long as the intended show plus a margin, including screen locking, USB disconnection, headphone changes, storage pressure, browser crash and network loss. Verify recovery from completed chunks and quantify any unrecoverable final chunk. Listen to a sample; meters alone do not prove good sound.

Exercise last-second Play next, duplicate remote commands and queued files that fail to download. If the next crowd track is not cached and validated, keep the next cached album track ready. A failed cue connection must not mute or replace the public bus. The original album must continue during the agreed offline interval.

