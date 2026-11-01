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

## Later on 1 November

- **Re-teach a changed format (v2).** Examples and pipelines carry a generation (migration v5). After drift, approving a training example with `retrain` starts the next generation; crystallize and verify use only that generation; v1 keeps running until v2 is verified and approved. `prepare-format-change-sample` imports weeks 4–6 in a changed bank export. The version diff aligns steps, so the change reads as one inserted `rename columns` step plus one changed date format. Browser-verified end to end.
- **Holdout protection.** Approved holdout references are refused to agent, MCP, A2A, CLI and automation callers in step actions (including `join`'s right table), `preview-table` and `export-table`, and hidden from their `list-tables`. Tested.
- **`/home` overview.** Explains the loop, shows live per-task totals from recorded runs (`get-overview`) and the measured benchmark.
- **Public demo mode.** `ROTE_PUBLIC_DEMO=true` refuses every agent request server-side (403 before inference), disables MCP, shows a banner and wipes the shared workspace on the first read after each hour. Verified locally with `AUTH_DISABLED=true`. `docs/deploy.md` lists the deploy steps; nothing was deployed.
- **Agent setup.** The 15 step actions are preloaded as initial tools and the system prompt describes how to teach a job with recorded steps.
- `netlify.toml` no longer carries the template's analytics IDs or trusted origins.
- `scripts/fetch-cdsco.ts` is ready; the cloud environment blocks `cdscoonline.gov.in`, so it has not run.

Checks after these changes: typecheck passes, 87/87 tests, doctor clean, benchmark 18/18 + 18/18 with 3/3 drift stops per task.

## Still pending

- Real model-backed teaching run and agent token/cost/time numbers (needs the local key).
- Automated repair loop, scheduling, eval promotion from a real trace, CDSCO task.
- Deployment, Clips video and Slides deck (need Mohit's accounts and approval).
