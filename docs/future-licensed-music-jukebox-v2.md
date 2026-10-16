# Future concept: licensed-music jukebox (not authorized for implementation)

**Status:** V2 / separate-product discovery only. Preserve this brief for when the owner explicitly asks to start V2. This is distinct from current indie-artist OurJam and from the existing DJ V2 plan in docs/10-dj-v2-plan.md.

## Concept
A jukebox with the same intuitive, collaborative, game-like OurJam participation mechanics. Listeners can select music from participating catalogs and propose/vote on how music affects the communal experience. Artists and labels opt in and define policies for where, when, and how their recordings, compositions, metadata, and derivatives may be used. The product evaluates every requested track and use against those policy grants, and tracks compensable uses to pay rightsholders per licensed play. Potential commercial catalog sources might include Apple Music/iTunes or other providers *only where their actual APIs and terms allow the intended playback and use*.

## Essential prerequisites
- Complete music rights and label/artist/publisher/composition/performance agreements before any commercial playback, sampling, remixing, generation, downloading, or synchronization. An Apple Music/iTunes link or consumer purchase alone confers no such rights.
- Verify catalogs, territories, expiry, availability, allowed devices/events, derivative policies, redistribution permissions, attribution, takedown and revocation.
- Distinguish composition/publishing, master sound-recording, public performance, mechanical and derivative permissions; geofence and enforce use-specific licenses.
- Artist/label self-service sign-up and authenticated policy grants, policy versioning, provenance, disputes and revocation.
- Tamper-resistant per-play usage ledger, transparent royalty calculations, contracted per-play payouts, reconciliation, refunds, reporting, settlement and fraud controls.
- Separate identity, payments, content, storage, and licensing security domains with auditable approvals.
- Determine whether a new repository/product is more appropriate than an OurJam application variant; avoid implying that today's independent-artist product carries catalog licenses.

## Scope boundary
Do **not** build or enable this concept now. Current work serves independent artists uploading audio they own or are authorized to use, and building first-run/replay tutorials. Start a separately approved licensing/product plan only when the owner invokes this V2 concept.
