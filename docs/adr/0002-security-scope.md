# ADR 0002: Deliberate public collaboration and private artist controls

Accepted October 10, 2026. The crowd chooses public musical ideas. The artist authorizes the application and a selected generator to process the core prompt. Those services are plaintext processing endpoints. This is not a private messaging application and does not claim service-blind encryption of generation inputs.

Use an opaque random guest session, server-held hashed credentials, HttpOnly same-origin cookies and per-event membership. Privileged artist routes require a separate expiring session obtained with an operator bootstrap credential. This initial single-artist operator capability does not fulfill the later multi-artist native account roadmap. Public data never includes operator secrets or core prompts.

For microphone recording, retain bytes on the artist endpoint initially. Private uploads remain disabled until their encryption, storage and consent design is implemented and verified.

Full E2EESA conformance remains unclaimed. Independent release review, witnessed executable transparency and detailed platform profiles require additional evidence; author's checks cannot impersonate independent review.
