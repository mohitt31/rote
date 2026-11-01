# Rote replay benchmark

Sample data only. 2026-11-01T00:50:14.767Z · Intel(R) Xeon(R) Processor @ 2.10GHz · Node v22.22.0 · in-memory PGlite (same migrations as the app).

| Task | Teach once | Unseen weeks correct | Replay median / p95 | Model tokens per replay | Drift stopped |
| --- | --- | --- | --- | --- | --- |
| Batched payout reconciliation | 212 ms | 18/18 | 8.4 / 10.0 ms | 0 | 3/3 |
| Vendor price-list cleanup | 95 ms | 18/18 | 5.6 / 6.7 ms | 0 | 3/3 |

Agent-only runs (tokens, cost, time): not measured yet; they require a real traced model run.

Drift cases, Batched payout reconciliation: bank renamed amount_minor → amount → Input schema drift: bank; bank switched to ISO booking dates → Date does not match declared formats; one bank amount off by 1 cent → Sum validation failed: squared_delta.
Drift cases, Vendor price-list cleanup: new unit code (dozen) → Unmapped value; header renamed Unit Price → Price → Input schema drift: prices; conflicting duplicate SKU price → Unique validation failed: sku.

Teach once = prepare recorded week-1 steps → approve training and holdout → crystallize → verify → promote. Replay = persisted `run-task` per unseen week (weeks 3–20), checked against the generator's independent reference.

Reproduce: `./scripts/local pnpm benchmark`. Raw numbers: `benchmark/results.json`.
