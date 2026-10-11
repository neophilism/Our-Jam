# Speaker and headphone routing

The performer console's **Speaker & headphone outputs** panel selects two browser media outputs. Device choices and confirmation live only in the current tab and reset on reload. Show audio and prepared local album copies use the show output; published and unreleased artist previews use the headphone output and the authenticated operator audio route. Cue playback never submits listener telemetry.

The safest portable setup remains a show device connected to the speaker and a second phone/laptop connected to headphones. That fallback works without browser output selection. On a capable browser, same-tab cueing is enabled only after:

1. Selecting two different explicit output IDs. System-default and communications aliases do not qualify.
2. Playing the short, quiet test tone through each selected output.
3. Confirming that the show tone was audible only at the speaker and the preview tone only in headphones.

Device IDs alone cannot prove physical isolation: two endpoints may reach the same mixer or cable. This confirmation is a rehearsal step performed by the artist, not a software certification. Do not test outputs at unsafe volume. Complete the actual Soundcore/interface/headphone route test before an event.

## Permission and failure behavior

Output selection uses `HTMLMediaElement.setSinkId`; the browser picker uses `MediaDevices.selectAudioOutput` when available. Both require a supported secure browser context and the browser's permission policy. The selector otherwise lists already permitted outputs. The explicit **Allow audio device list** button briefly requests microphone access to reveal available devices and immediately stops every input track; it does not record or upload anything.

Changing a selection stops the current preview and invalidates test confirmation. Output selection is probed before becoming active; a rejected selection retains the previous choice. Show playback and local backup apply the selected sink before starting audio. An explicit-sink failure stops that play attempt and never causes application code to retry on the default output. Preview controls become available only after its sink has been applied.

The show-output selector is locked while this tab controls playback or is playing local backup. Release live control and stop backup before changing that route. Browser `devicechange` invalidates cue confirmation and closes the current preview. If the chosen show output disappears, local show/backup audio stop and the controller makes a best-effort release. Voting pauses when the release reaches the server, or after lease expiry if networking fails. Reconnect and explicitly choose/test outputs before resuming. This is detection and recovery; an operating system can change physical routing before it emits a browser event.

Default-output behavior on the separate headphone device is controlled by that device's operating system. The application does not capture the selected output, mix microphones, split stereo channels or exclude cue from an externally configured loopback recorder. Check recorder input and hardware routing independently. Native output routing and real iPhone/Android behavior remain separate acceptance work.

## Evidence

Browser tests use real synthetic WAV playback and test tones with fixture output-device APIs. They verify distinct-output gating, actual media-element sink assignments before playback, failed selection, preview closure without stopping the surviving show output, show-control release on speaker disappearance, paused voting and reset on reload. Existing local-backup and artist-review browser scenarios remain regression gates. These fixtures do not prove physical routing or Soundcore karaoke capture.

Official API references: [setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId), [selectAudioOutput](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/selectAudioOutput), [Audio Output Devices API](https://developer.mozilla.org/en-US/docs/Web/API/Audio_Output_Devices_API).
