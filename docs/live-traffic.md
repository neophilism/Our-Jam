# Venue traffic and bounded reads

Public assets do not validate sessions or consume API rate limits. The health liveness endpoint does not query PostgreSQL and remains available when a client exceeds its API budget. Readiness still checks the database.

| Traffic | Per-process allowance |
| --- | --- |
| Anonymous API reads | 7,200/minute per connection address |
| Authenticated reads | 180/minute per verified session |
| Ordinary writes | 180/minute per verified session, otherwise per address |
| Guest session creation | 120/minute per address on each web/native creation route |
| Performer login | Unchanged: 8/minute per address |
| Room admission | Unchanged: 12/minute per verified session |

The anonymous read allowance covers 100 listeners receiving approximately one invalidation/second, plus initial navigation. It does not grant votes. Five-point ballots, admission capacity, code checks, Origin checks and authorization remain authoritative. Inventing cookie values does not create an authenticated rate-limit bucket. Session lookups are reused within one request only, so revocation takes effect on the next request.

The API intentionally does not trust forwarded client-address headers. Behind a proxy, unrelated callers may share the proxy's allowance. A deployment-specific verified proxy policy and a shared limiter store are required before horizontally scaling; these are not implemented by raising this allowance. Process restart resets these in-memory counters.

Public event snapshots run at most four at once, leaving pool capacity for commands. At most 200 distinct snapshots can be pending and queue wait is capped at 2.5 seconds. Simultaneous reads of the same room and participant coalesce; different identities and rooms never share personalized results. Completed results are not cached. Operator snapshots do not share this queue. Overload returns a recoverable 503; clients retain stale-state voting protection and periodically retry.

Invalidation streams carry no private payload. Limits are 1,000 streams per room and 2,000 per process. A slow socket whose write buffer fills is disconnected instead of accumulating unlimited updates. Reconnects obtain authoritative snapshots; the durable event log remains the source of changes. A read-only authenticated `/api/operator/traffic` endpoint reports queue and connection counts, without room identifiers or participant data.

Tests simulate 100 arriving guest identities at one address, create real database memberships, read personalized snapshots concurrently and verify separate budgets, fake-cookie rejection, unchanged login throttling and private-prompt omission. Additional tests cover bounded queues, timeout cleanup, read failures and slow-stream disconnection. This is deterministic API/SQL evidence, not 100 physical phones or deployed latency/throughput certification. Run the venue load and network-loss rehearsal before declaring a show capacity.

## Multi-instance invalidation

Each committed event mutation increments an event-scoped change counter in the same
transaction as its durable log entry. Every API instance polls counters only for
rooms with connected streams, so a delayed commit cannot be skipped by a
global event-log high-water mark. The stream still carries only a refresh
hint; clients fetch an authorized snapshot and use periodic fallback reads
after disconnection. Deploy additive migration 023 before this application
revision. This is software fanout evidence; venue load and network-loss
rehearsal remain pending.
