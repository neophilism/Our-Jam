# Community review

The artist console shows reported and hidden comments for its event, including report reasons, and release visibility controls. Server authorization resolves the comment/release to its event and artist before modifying it. Every artist hide/restore writes an audit action and event invalidation. Participant sessions cannot use artist review endpoints.

Hidden comments disappear from fresh reads. Open listeners refresh comments every ten seconds. Hidden releases are excluded from public collections, credits, leaderboards and new media-link issuance. Previously issued private-storage URLs may remain valid for five minutes; downloaded copies and artist-supplied external URLs cannot be recalled. Do not treat a hide action as deletion of distributed media.

Author deletion removes the comment and its associated reports permanently. It is not represented as a moderator hide and cannot be restored by the artist. A participant cannot delete someone else's comment. Report reasons are private to the artist's review queue. Review endpoints do not expose private prompts.

This slice provides manual review for the current single-artist bootstrap login. Delegated moderator roles, appeal handling, multi-artist onboarding and abuse detection at public scale remain separate work.
