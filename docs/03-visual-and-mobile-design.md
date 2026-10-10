# Sound Wave visual and mobile design

## Art direction

Design a dark, dimensional acoustic field: luminous wave membranes surrounding energy-like cores, with folded surfaces, fine orbital filaments, subtle particles and directional light. Each Sound Wave appears alive through slow independent motion; stronger beats briefly compress and expand it. The result should suggest interacting musical elements rather than ordinary chat bubbles or rigid spheres.

Use Three.js with React Three Fiber for the web scene, custom shaders for deformation and light response, and a small, controlled amount of bloom. A full game engine is unnecessary for the initial product. Keep the renderer behind an interface so native mobile can use Expo-compatible rendering or a lighter Canvas/Skia implementation after an actual device benchmark. R3F documentation supports instancing and adaptive performance techniques [S12].

## Layout and readability

Make the visual field fill the usable stage viewport after the first few real submissions. With few waves, expand their influence areas and supporting filaments; with many waves, pack projected shapes into a weighted two-dimensional layout while using depth for appearance. This keeps the 3D character without letting labels disappear behind each other. Ambient visuals never imply nonexistent votes or submissions.

Use rank to control screen location and projected area. A bounded square-root scale prevents the leading wave from consuming the entire scene. The highest ranks sit in stable prominent positions; gentle spring motion lets neighbors move around them after vote changes. Interpolate changes over roughly 0.5 to 1.5 seconds, with limits on acceleration. A wave can look soft without expensive full fluid simulation.

Text belongs in a high-contrast overlay anchored to the wave, not distorted with its surface. Show phrase, points and an optional short creator name. Keep the top ten contributor strip separate from the wave ranking. Contributor ranking is derived from finalizable support on their own active waves, with ties handled consistently.

| Venue preset | Initial labeled waves | Intended use |
| --- | --- | --- |
| Tablet or small gathering | 8–12 | Close viewing with large text |
| Laptop or medium display | 12–20 | Small block party |
| Large screen | 20–40 | Larger venue after distance testing |
| Phone | 4–8 highlighted plus list | Touch interaction and battery limits |

These are starting values, not hardware guarantees. The performer controls the visible label cap and can preview at the planned viewing distance. Store participation capacity separately. Ten, one hundred or one thousand submitted waves can all remain in the ranked list, but one thousand readable labels cannot fit an ordinary display. At high counts, show leading labeled waves plus an aggregate field representing the rest and an explicit “more waves” count.

## Audio reactivity

Analyze the actual playback source on the show laptop using Web Audio: short-window amplitude, low-frequency energy, onset estimates and a smoothed beat envelope. Precompute a compact envelope and optional beat grid at upload for deterministic fallback. Add slow procedural motion and per-wave phase variation; every object should not pulse identically.

The public display receives timestamped compact features and playback anchors rather than a new audio broadcast. Interpolate locally at the render rate. Phone visuals follow the event's clock while voting and the phone's local audio only when explicitly showing a preview visualizer. If the show is playing outside the application, use a crew-selected audio input and manual timing; microphone analysis is a degraded visualization route, not an authoritative track-end detector.

## Mobile behavior

Keep touch targets at least 44 CSS pixels and provide plus/minus controls or a simple vote slider in a stable sheet. Do not require people to tap rapidly moving objects. A selected wave remains stationary in its control panel even if its visual rank changes. Add a screen-reader-friendly ordered list with the same information and controls.

Limit mobile mesh count, shader complexity, pixel density and postprocessing. Stop animation in the background. Offer reduced-motion and low-data settings; remember them. Reconnect from a state snapshot without reanimating every historical vote. A context loss, thermal slowdown or unsupported GPU switches to an accessible 2D wave view without disabling participation.

## Visual acceptance

The show renderer targets 60 frames per second on the designated laptop at the actual display resolution. Phone scenes target a stable 30 frames per second on the minimum tested device. These are release targets. Record dropped frames, thermal behavior, text readability and input latency during a 60-minute rehearsal.

Keep QR codes fixed, unobstructed and high contrast with proper quiet zones. Validate scanning from likely audience distances and outdoors. Rank is visible through position, size and numbers, not color alone. Honor reduced motion; avoid strobes and strong rapid full-screen flashes. Test VoiceOver, TalkBack, keyboard-only voting and zoom. Cinematic effects must never obscure the five-vote budget, deadline or action feedback.

