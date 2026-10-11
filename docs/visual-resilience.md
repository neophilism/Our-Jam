# Readable waves when graphics fail

The header's **Visuals** menu offers device/default, light animation and still waves. The choice stays in local browser storage and synchronizes across tabs; when storage is unavailable it remains usable for the current page. OS reduced-motion preferences always select a still field. In default mode, browsers exposing the data-saver preference also choose still waves. Unsupported browsers keep the ordinary default and offer the manual choice.

The layout, phrase labels, point counts and creator names now render separately from Three.js. Still mode does not import the large 3D scene when entering a page, and uses static CSS membranes with the same ranks and positions. It does not disable the ballot, preview or download controls. Selecting still mode after loading 3D cannot undo bytes already downloaded.

Light animation uses fewer mesh segments and orbit rings, a pixel ratio of one and a demand-render interval targeting 30 frames per second. Default animation retains the existing richer meshes and bounded pixel ratio. These are scheduling choices, not measured hardware performance guarantees. Both stop rendering when the document is hidden or the field is outside the viewport. Targets and sizes ease between rank changes without allocating new vectors every animation frame.

A real `webglcontextlost` event, a renderer error or a failed scene import switches that field to its readable static fallback. It stays there until the page reloads, avoiding a repeated graphics-recovery loop during voting. Browser-test coverage invokes `WEBGL_lose_context` and then reallocates a real vote through the normal API. It also checks that entering/reloading in still mode does not request the 3D chunk, preference persistence and reduced-motion precedence.

The existing phone/venue label cap remains independent of contributor capacity. When the field displays only leading waves, it states how many other waves are available in the phone list. This does not claim that all audience submissions fit legibly on one screen.

No schema migration, new service or dependency is required. Rollback restores the prior renderer; the saved preference key can remain harmlessly in local storage. Real iPhone/Android VoiceOver/TalkBack, venue screen distance/QR tests, 60-minute frame/thermal measurements and more advanced cinematic layout remain open acceptance work.

Renderer API reference checked during implementation: https://r3f.docs.pmnd.rs/api/canvas and https://r3f.docs.pmnd.rs/api/hooks. This implementation uses the installed R3F 9 API rather than the experimental next-version scheduler.
