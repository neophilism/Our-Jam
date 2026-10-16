# Game rules and ranking

## Default round rules

| Setting | Recommended initial value |
| --- | --- |
| New shows | Artist chooses 1–1,000 distinct Sound Waves each listener may vote for per song; one vote per Sound Wave |
| Existing shows | Legacy five-vote weighted allocation stays unchanged for historical compatibility |
| Own active submission | One distinct Sound Wave per participant per round |
| Submission length | Up to 48 visible characters with a separate server byte limit |
| Submission vote | One vote automatically assigned to the listener’s new Sound Wave |
| Reallocation | Unlimited within practical request limits before cutoff |
| Budget reset | Every new eligible album-track round |
| Generation count | One logical generation per eligible closed round |
| Minimum participation window | Initially 60 seconds for generation eligibility; rehearse and configure before show |
| Public leaderboard | Top ten contributors, adaptable to the screen |

The per-round voting limit applies to one participant identity, not every tab, device or screen. New shows count distinct voted-on Sound Waves (one vote each); older weighted rounds retain their previous five-vote limit. A guest session is lower-assurance identity. Guests can evade limits by starting fresh identities; document that limitation and mitigate with admission quotas, session controls and optional verification when abuse warrants it. Do not claim one-human-one-budget without a stronger admission method.

Set the participation window from rehearsal behavior: time to join, hear enough of the source, formulate an idea and revise a vote. Start by testing a 60 to 90 second minimum useful window rather than selecting a timer primarily to reduce generation costs. Phones allow simultaneous participation, so crowd size alone does not imply a linear wait. If an album track is too short, announce joining before it starts or configure a combined round in advance; never secretly extend a track deadline after listeners have acted. Monitor distinct contributors and voters to tune the next performance.

## Transactions and race conditions

Send a complete allocation vector with an expected revision and client command ID. In one database transaction, lock the round and participant allocation, verify that the round is open, validate the frozen per-song vote policy (one per Sound Wave and an artist-chosen total on new shows, existing five-vote allocation on older shows), verify every wave belongs to that round, and replace the vector. Update counters and append a durable event in that transaction. A retry with the same command ID returns the original result.

Concurrent phone tabs receive a conflict and refresh rather than independently overspending the same allowance. A wave submission and its initial vote occur in one transaction. If the participant has used their allowance, let them move a vote from an existing Sound Wave in the same request. Do not create an unvoted public wave or exceed that song's limit.

The server's receipt and transaction ordering determine the cutoff. A client clock, cached screen or offline timestamp cannot extend a round. A boundary close and a vote must serialize on the same round lock so a frozen snapshot cannot contain an inconsistent count. Keep the close transaction short; provider calls happen afterward.

## Editing and disappearing waves

Removing a creator's vote does not remove other people's support. If the total support reaches zero, the bubble disappears; keep its record for audit and possible reactivation in the same round. If the creator is the only voter, permit text replacement through a new revision. Once other people support a phrase, its meaning is immutable: withdrawing and proposing a new wave must not silently change what those people voted for.

Normalize Unicode, whitespace and case for exact duplicate detection while keeping a readable display form. Block invisible-text tricks and HTML. Show likely duplicates before submission. An exact duplicate becomes a vote on the existing wave and consumes one vote. Preserve the original author; the duplicate submitter is a supporter, not an additional credited author. Do not use uncertain semantic merging to erase different musical ideas.

One-active-own-wave limits are evaluated atomically. A wave with other supporters remains the creator's active wave even if their own points move away. A moderated wave is removed and its allocations are returned within the round; those participants can reallocate before the existing deadline. The full action is audited.

## Ranking and prompt inclusion

Rank active eligible waves by total points descending. Show unique supporters alongside points to expose concentrated support. For equal totals, use a deterministic, event-auditable tie key derived from a random round seed committed before voting opens and revealed after close. Do not depend on fluctuating render position or favor early submission merely because it was first.

The public display and prompt selection use the same authoritative ranking. The prompt compiler traverses that order, excludes only documented moderation or artist-constraint conflicts, and appends complete wave phrases within the provider budget and configured maximum wave count. Stop at the first budget overflow among otherwise eligible waves so a lower-ranked short phrase does not silently leapfrog a higher-ranked phrase. A preview can show the current likely inclusion boundary; it remains provisional until close.

Store selected wave IDs, totals, unique supporters, tie decisions, skipped reasons, prompt version and exact payload hash. The immutable core is never truncated to make room for the crowd. If the core itself does not fit, event setup fails before the show. Audience text is treated as data, not trusted instructions to rewrite the core, reveal secrets or change provider settings.

## Fairness and abuse resistance

Friends coordinating their musical preferences is expected social play. Automated accounts, identity multiplication, request floods and harassment are abuse. Use participant and event caps, per-session rate limits, suspicious-pattern review and reversible moderation. Shared venue Wi-Fi makes IP-only blocking unfair; apply IP rules cautiously and keep a crew recovery path.

Changing votes repeatedly must not generate extra lifetime credit. Avoid rolling “votes ever received” counters. Score the immutable closing snapshot and settle credits only when the resulting track is publicly released. Failed jobs show pending or failed credit, not a completed contribution. A later hidden track preserves history privately while being excluded from public rankings according to a documented moderation rule.

## Leaderboards

Each artist has event, weekly, monthly and all-time boards. Store timestamps in UTC and define week and month boundaries using the artist's configured timezone; weeks start Monday by default. Snapshot the timezone policy so later configuration changes do not rewrite history unexpectedly.

Primary boards count waves included in released generations and final support earned on those waves. Record total points and distinct other supporters separately. A participant’s own votes count in the live game but do not inflate the “support from others” leaderboard. Count each round-wave only once. Offer all-time totals and a per-round average with a minimum qualifying-round count.

Secondary measurable awards include **Early spark** for an early submission that later achieves meaningful support, **Late breakout** for a wave submitted in the final quarter that reaches the top group with at least three other supporters, and **Crowd favorite** for an artist-selected release. Timing alone does not establish thoughtfulness. These badges do not affect vote weight or prompt order. Keep thresholds configurable and visible.

Names, avatars and public anonymity can be changed in the account. Display aliases are separate from durable IDs. Switching to anonymous updates public views and credits without revealing the private account; historic audit records remain restricted. Music avatars are generated from a random profile seed, never an email address or other identifying input.

