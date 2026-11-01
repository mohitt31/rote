# Day 4 progress — 1 November 2026

Work continued in a cloud session from the laptop WIP commit (`22c55f5`). Nothing was deployed. No model inference was run: the Gemini key exists only on the local machine.

## Delivered

- **Guided `/tasks`.** Five steps (References → Crystallize → Verify → Approve → Run) with table pickers and inline previews instead of raw table IDs and JSON. Verification shows the comparator self-checks (identical copy passes, changed value rejected, dropped row rejected) and per-example row diffs. Run shows the output preview, `0 model tokens · N ms`, and a cost card that reports only recorded numbers.
- **Drift hand-off.** A stopped run offers "Ask the agent to handle this week", which opens the agent chat with the task, version, input table IDs and stop reason as context (`sendToAgentChat`, not auto-submitted). Re-teaching a changed format inside the same task is still unsupported: references freeze at first crystallization.
- **Version diff and history.** When a newer version exists (for example from `parameterize-pipeline`), step 2 shows a step-level diff against the previous version; step 4 lists all versions with status and hash.
- **Second task.** `prepare-vendor-sample` creates a synthetic vendor price-list cleanup task (messy headers, spacing/casing, currency strings, unit synonyms, duplicate rows) with an independent reference.
- **Benchmark.** `pnpm benchmark` (`benchmark/replay.benchmark.ts`) teaches each sample task once, replays weeks 3–20 through persisted `run-task`, checks each output against the generator's reference and runs three drift cases per task. Results are in `benchmark/results.md` and `benchmark/results.json`.
- **CLI and MCP.** `run-task`, `list-tasks`, `get-task` and `list-tables` are MCP tools (`mcpTool: true`).
- **Fixes.** `get-verification-diff` now serves GET (the UI query returned 405). Tasks/Workbench sidebar links have icons and active states.

## Finding from the benchmark

The first vendor pipeline deduplicated on `sku` alone, so a week with two different prices for one SKU silently kept the first price. The recorded steps now drop only exact duplicate rows and then require unique SKUs, so a conflicting price stops the run. A regression test covers it.

## Evidence

- `pnpm typecheck` passes; `pnpm test` 83/83; `agent-native doctor` clean.
- `pnpm benchmark`: payouts 18/18 correct, 8.4 / 10.0 ms median/p95, drift 3/3 stopped; vendors 18/18, 5.6 / 6.7 ms, drift 3/3 stopped. Sample data, in-memory PGlite, cloud Xeon VM.
- Browser smoke (Playwright, local dev): both sample tasks run end to end through the UI; a drifted input shows "Stopped: drift" and the hand-off opens the agent chat composer with the prefilled request and context chip.
- CLI: `AGENT_ORG_ID=<workspace org> pnpm action run-task '{"taskId":…,"inputs":{"prices":…}}'` returned `succeeded`, 0 tokens.
- MCP: with a per-user token created on `/mcp/connect`, `tools/list` includes the four Rote tools and `tools/call run-task` returned "Deterministic replay completed without model calls". A static `ACCESS_TOKEN` carries no user identity, so Rote correctly refuses it.

## Still pending

- Real model-backed teaching run and agent token/cost/time numbers (needs the local key).
- Re-teach a changed format as v2 in the same task; automated repair; scheduling; eval promotion from a real trace.
- Known gap: `list-tables` and `preview-table` let the in-app agent read any owned table, including a holdout reference, if it knows to look. Holdout rows are excluded from `get-task` and the verification diff only.
- Deployment, public demo, Clips video and Slides.
