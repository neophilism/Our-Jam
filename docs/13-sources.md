# Primary sources and implementation evidence

Sources checked October 10, 2026. These establish current documented capabilities and constraints, not the behavior or entitlement of an account that has not been tested. Recheck versions, terms, pricing and supported platforms when implementation begins. Recommendations in the plan are design judgments unless identified as a provider fact.

## S1 Stable Audio licensing

[Stable Audio commercial and usage licensing](https://kb.stability.ai/knowledge-base/stable-audio-commerical-and-usage-licensing)

The provider describes standalone audio distribution and commercial app-related uses as permitted subject to its applicable terms. Self-hosted model licensing is separate. This supports evaluating Stable Audio; it does not confirm the user's particular hosted account, contract or generation rights.

## S2 Stable Audio model capabilities

[Stable Audio 3 announcement](https://stability.ai/news-updates/meet-stable-audio-3-the-model-family-built-for-artistic-experimentation-with-open-weight-models)

[Stable Audio 3 research](https://stability.ai/research/stable-audio-3)

These describe the model family and generation research. Laboratory inference performance is not an end-to-end hosted-service promise. The plan requires actual latency and musical-fit testing.

## S3 ElevenLabs composition API

[Compose music API](https://elevenlabs.io/docs/api-reference/music/compose)

Documents prompt or composition-plan input, duration controls and an instrumental option. Treat parameter limits as adapter capabilities that can change, not shared constants across providers.

## S4 ElevenLabs Music Terms

[Music Terms](https://elevenlabs.io/music-terms)

The retrieved page is dated October 9, 2026 and includes restrictions on music libraries, model resale and prompt content. Confirm applicable effective terms and written permissions for the planned download catalog before relying on the service.

## S5 ElevenLabs API terms

[ElevenAPI Terms](https://elevenlabs.io/elevenapi-terms)

The Music API exhibit addresses third-party API access and authorization. The application-specific interpretation and entitlement require confirmation; ordinary paid API access is not treated here as sufficient evidence.

## S6 Too Lost delivery timing

[How long does it take for my music to go live](https://help.toolost.com/hc/en-us/articles/360054817351-How-Long-Does-It-Take-for-My-Music-to-Go-Live-in-Services)

Describes quality control and service ingestion, with recommended advance scheduling. Supports treating DSP delivery as a later workflow rather than a live-event deadline.

## S7 Soundcore speaker documentation

[Rave 3S user guide](https://service.soundcore.com/article-description/soundcore-Rave-3S-User-Guide-A31A3Z11?ref=Home_Page)

[Rave 3S official product page](https://www.soundcore.com/rave-3s-ai-karaoke-party-speaker)

Documents this variant's interfaces and bundled microphone use. The user's exact Rave variant is not established. The plan does not infer an audio recording output from an input connector or charging port.

## S8 Browser output routing

[MDN AudioContext setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/setSinkId)

[Chrome output device selection](https://developer.chrome.com/blog/audiocontext-setsinkid/)

Documents output routing and compatibility constraints. A separate preview phone is the default to reduce dependence on desktop multi-output compatibility.

## S9 Render realtime and workers

[Render WebSockets](https://render.com/docs/websocket)

[Render background workers](https://render.com/docs/background-workers)

Supports the proposed API/realtime and worker deployment pattern. Account-specific capacity and cost still need verification.

## S10 Render file durability

[Render persistent disks](https://render.com/docs/disks)

Documents ephemeral default filesystems and available persistent disks. The design uses separate durable object storage for released media and recordings.

## S11 Neon environment and connections

[Neon branching workflow primer](https://neon.com/docs/get-started-with-neon/workflow-primer)

[Neon connection URI API](https://api-docs.neon.tech/reference/getconnectionuri)

Supports explicit database branches and pooled-connection configuration. Verify the selected driver's actual TLS behavior and database plan during implementation.

## S12 React Three Fiber performance

[Performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)

[Scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)

Supports instancing and performance-aware rendering. Frame-rate targets require testing on the designated hardware.

## S13 Web push on iOS

[WebKit web push for web apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

[Apple web push documentation](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)

Documents Home Screen web-app push and permission behavior. The QR browser route must remain usable through foreground updates and optional email.

## S14 Expo audio

[Expo audio documentation](https://docs.expo.dev/versions/latest/sdk/audio/)

Describes native playback, recording and platform configuration. The plan still requires real-device routing, interruptions and background-playback tests.

## S15 Expo notifications

[Sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/)

[Notification behavior](https://docs.expo.dev/push-notifications/what-you-need-to-know/)

Supports the native notification architecture; delivery receipts and device restrictions remain operational concerns.

## S16 Apple distribution policies

[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

[Account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

Use during native-release review for user content, privacy, purchases and account control. Store requirements and regional exceptions must be checked at submission.

## S17 Google Play distribution policies

[Developer program policy](https://support.google.com/googleplay/android-developer/answer/18258653?hl=en)

[User generated content](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en)

[Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)

Use during native-release review for moderation, privacy, account deletion and purchase-policy decisions. These sources do not guarantee store approval or its timing.

