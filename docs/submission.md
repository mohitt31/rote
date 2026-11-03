# Submission draft — Agent-Native Hackathon

Draft only. Fill every `[TO FILL]` from a real run before submitting; delete any sentence that is not true on the day.

## Project name

Rote

## Description (≈250 words)

Every week, the same data chore goes back to an AI agent — reconcile payouts against the bank, clean a vendor price list — and every week it costs the same tokens and time for the same job.

Rote lets you teach the job once. The agent does it with Rote's 15 table actions, and every call is recorded. You approve the output as a reference and pick an unseen holdout week. Rote crystallizes the recorded steps into an allowlisted pipeline (no generated code), proves its own check works (an identical copy passes, a changed value and a dropped row fail), replays every reference including the holdout, and asks you to approve the exact version hash. From then on, `run-task` replays the job with zero model calls — from the UI, the CLI or MCP. When the input changes, Rote stops instead of guessing, hands the week to the agent, and lets you teach the new format as v2 with a step diff.

Measured on synthetic sample data (`pnpm benchmark`): 18/18 unseen weeks correct for each of two tasks, 8.2 ms / 5.6 ms median replay, 0 model tokens, 3/3 drift cases stopped per task. Teaching run with the agent: `[TO FILL from the real trace: tokens, time]`.

Agent-Native features: actions as the single source of truth (UI, agent, CLI, MCP), agent chat with screen context and drift hand-off, `needsApproval` on reference approval and promotion with the framework audit log, observability trace capture, MCP tools, public demo mode that refuses agent requests server-side.

Limits: sample data except `[TO FILL if CDSCO is done]`; no automated repair or scheduling yet.

Pre-existing work: started 31 Oct 2026 from the MIT Agent-Native Chat template (0.222.2); libraries listed in `package.json`. Built with AI coding assistants under my direction.

Team: Mohit Prajapati (solo).

## Links

- Repository: `[TO FILL — public repo URL after Mohit makes it public]`
- Public demo: `[TO FILL — demo site URL]`
- Clips video (public): `[TO FILL]`
- Slides (optional): `[TO FILL]`

## Demo video outline (2:30, real app only)

1. 0:00–0:15 — The problem: the same weekly reconciliation, every week, at agent cost `[real numbers]`.
2. 0:15–0:40 — The agent does week 1 with step actions (sped up); approve training and holdout references.
3. 0:40–1:20 — Crystallize → comparator self-check badges → training and holdout "All rows match" → approve the exact hash.
4. 1:20–1:45 — Week 3: Run → "0 model tokens · N ms"; home page counters move.
5. 1:45–2:05 — Bank changes its export: run stops on drift → teach the new format → v1→v2 diff (one added rename, one changed date format) → v2 runs week 6.
6. 2:05–2:30 — Benchmark table, `tools/call run-task` over MCP, tagline and links.

## Final checklist (all must be true)

- [ ] Real agent teaching run done; its trace numbers shown in the app and README
- [ ] Both sample tasks run end to end on the private deploy
- [ ] Public demo opens in an incognito window without sign-in; banner visible; agent refused
- [ ] Repository public; README complete; `.env.example` only; no secrets in history
- [ ] Clips and Slides links open in an incognito window without login
- [ ] Every number in the description, README and video comes from a recorded run
- [ ] Pre-existing work and team listed; form submitted by 9 Nov 18:00 IST; receipt confirmed
