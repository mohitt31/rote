# Rote replay benchmark

Sample data only. 2026-11-04T18:38:57.255Z · Apple M4 · Node v22.22.0 · in-memory PGlite (same migrations as the app).

| Task | Teach once | Unseen weeks correct | Replay median / p95 | Model tokens per replay | Drift stopped |
| --- | --- | --- | --- | --- | --- |
| Batched payout reconciliation | 75 ms | 18/18 | 2.5 / 3.5 ms | 0 | 3/3 |
| Vendor price-list cleanup | 28 ms | 18/18 | 1.6 / 2.1 ms | 0 | 3/3 |

Scale, Vendor price-list cleanup: 10,000 source rows, 5/5 replays correct, median 86 ms (max 89 ms) per persisted run-task, 0 model tokens. One-time CSV import: 179 ms.

Agent-only runs (tokens, cost, time): not measured yet; they require a real traced model run.

Drift cases, Batched payout reconciliation: bank renamed amount_minor → amount → Input schema drift: bank; bank switched to ISO booking dates → Date does not match declared formats; one bank amount off by 1 cent → Sum validation failed: squared_delta.
Drift cases, Vendor price-list cleanup: new unit code (dozen) → Unmapped value; header renamed Unit Price → Price → Input schema drift: prices; conflicting duplicate SKU price → Unique validation failed: sku.

Teach once = prepare recorded week-1 steps → approve training and holdout → crystallize → verify → promote. Replay = persisted `run-task` per unseen week (weeks 3–20), checked against the generator's independent reference.

Reproduce: `./scripts/local pnpm benchmark`. Raw numbers: `benchmark/results.json`.
