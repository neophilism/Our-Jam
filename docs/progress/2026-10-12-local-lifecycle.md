# Real local rehearsal lifecycle correction - October 12, 2026

Depends on PR #25's actual native/local application, not the superseded parallel PR #27. The local launcher previously ran only generationTick, omitting production's tickRounds. That left server-side expired-deadline closure and playback-controller loss handling dependent on further interaction.

The local lifecycle now runs the same round/lease reconciliation before zero-budget generation processing. Concurrent ticks share one promise; shutdown stops new ticks and drains the current transaction before database closure. Startup reconciles restored state before serving requests. Both local budgets must remain exactly zero. No schema change, provider key, cloud mutation or spending is introduced.

Regression tests cover deadline closure with saved Sound Waves and zero attempts/cost, expired controller pause without a new job, concurrent-tick coalescing, orderly shutdown and rejection of nonzero local budget configuration. The existing empty-start/upload/playback/audience-to-stage/$0/restart browser test remains required. Tests are authored; exact-head CI evidence must be attached before merge or a completion claim.

Rollback restores the former local entrypoint but loses this lifecycle correction. No user database or uploaded file should be deleted. The native Simulator binary and its UI tests remain governed by #25. The live provider comparison and hosted private storage still need separately authorized integration tests; the missing tests are not falsely counted as passed.
