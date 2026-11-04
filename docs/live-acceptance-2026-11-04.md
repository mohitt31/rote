# Live acceptance — 4 November 2026 (IST)

Recorded on Mohit's laptop (Apple M4, local dev server, local PGlite, Gemini 3.1 Flash-Lite on a free-tier, billing-disabled Google project). Everything below was read back from the running app's actions and framework trace API; nothing is estimated.

## 1. Real model teaching run (guided)

- Chat thread `chat-c36adb16-0a37-4a84-8cab-2a3fccb03f6f`, framework trace `run-1793769080450-xsdz0t`.
- The prompt named the input table IDs and spelled out every step and parameter (a written recipe). This is a **guided** real-model execution: the model called the tools and wired the real output IDs between steps; it did not discover the reconciliation logic itself.
- Trace totals: 12 model calls, 11 tool calls (11 successful, 0 failed), **240,781 input + 1,255 output tokens**, **42,061 ms**. Framework list-price estimate US$0.0199; the free tier billed nothing.
- Output `2f9f0c1a-00a4-40dd-bae7-58c257015b30`: 8 rows, columns `settlement_id, net_cents, amount_minor, transaction_count, delta_cents`. It matched the independently generated week-1 reference `5197cb41-…` row for row (sorted multiset comparison).
- An earlier attempt on 1 November (`chat-b2d9d6f0-…`, 52.4 s, 203,106 tokens) produced the right numbers but renamed `amount_minor` to `amount_minor_parsed` by setting `newColumn`, so it did not match the reference and was **not** used. The new prompt forbids `newColumn` on parse steps.

## 2. Human approvals and promotion

Mohit, in the app UI:

1. approved the training example (week-1 inputs, reviewed reference `5197cb41-…`, recorded source = the real agent output above);
2. approved the independent holdout (week 2, reference `878a1187-…`);
3. crystallized and verified version 1: comparator self-checks passed (identical copy passes, changed value and dropped row rejected), training and holdout matched;
4. approved promotion of the exact hash `65b5acd8577be28b075351ca943625994036d1c9ed95737668495ba8377a1899`.

The task's run history attributes the teaching run as `mode: agent` with the trace totals above (single completed trace covering the full lineage).

## 3. Next-week replay

- Week 3 (unseen), `run-task` from the UI: **succeeded in 19.6 ms, 0 model tokens**, output `28a95e94-02d1-417e-ad0f-d0a26e731475` (8 rows).
- Checked in a separate process against the generator's independent week-3 reference (`batchedPayoutSample(3).expected`) with the app comparator: **pass**.
- Same job, same laptop: agent 42,061 ms and 242,036 tokens vs. replay 19.6 ms and 0 tokens. One run each; the replay time includes the SQL reads and writes of `run-task` but not HTTP or UI.

## 4. Drift and deterministic repair (live)

- `prepare-format-change-sample` imported weeks 4–6 in the bank's changed export (amount column renamed, ISO dates).
- `run-task` on week 4: **stopped, "Input schema drift: bank", 2.3 ms, no output.**
- `propose-drift-fix`: **proposed in 34.3 ms with 0 model calls**: rename `amount_cents → amount_minor`, `booking_date` format `dd/MM/yyyy → yyyy-MM-dd`. Its re-run output (8 rows) matched the week-4 independent reference row for row.
- Approving that output as the format-2 training example (and the week-5 holdout) is left for the recorded demo.

## 5. Restraint report

`get-restraint-report` grouped the two traced agent runs of the 11-step reconciliation (445,142 tokens, 94.5 s in total) and, after promotion, shows them as covered by "Sample batched payout reconciliation v1". A separate failed 5-step attempt from 1 November is listed as not covered.

## Not shown here

Deployment, the public demo, the Clips video and Slides. Automated model repair and scheduling are not implemented.
