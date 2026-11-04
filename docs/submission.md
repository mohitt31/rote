# Submission — Agent-Native Hackathon

Every number below comes from a recorded run; sources are listed under "Evidence". Re-check the live demo the day you submit and delete any sentence that is no longer true.

## Project name

Rote

## Tagline

Teach the agent a data job once. Rote replays it forever with zero model calls, and stops instead of guessing when the data changes.

## Description (~250 words)

Teams hand the same data chore to an AI agent every week: reconcile payouts against the bank, clean this month's drug-alert list. The agent redoes the whole job each time, at full token cost, and may do it slightly differently.

Rote turns that job into a verified pipeline. The agent does it once with Rote's 15 table actions, and every call is recorded. A person approves the output and an unseen holdout. Rote crystallizes the recorded steps into an allowlisted plan (no generated code), proves its own comparator works, replays both references, and the person approves the exact version hash. From then on, `run-task` replays the job with zero model calls from the UI, the agent, the CLI or MCP.

Measured on one machine: the guided teaching run with Gemini 3.1 Flash-Lite took 42.1 s and 242,036 tokens; the approved replay of the next week took 19.6 ms and 0 tokens, and matched an independent reference. When the bank changed its export format, the run stopped in 2.3 ms; "Suggest a fix" explained the renamed column and new date format in 34.3 ms with 0 model calls.

The agent shows restraint: before working it checks for an approved pipeline and calls `run-task` instead; a restraint report shows which repeated agent work is not covered yet.

Real data: India CDSCO "Not of Standard Quality" drug alerts. Taught on January 2026 (218 rows), verified on February (217), March (190 rows) replayed with 0 tokens.

## Agent-Native features used

- Actions as the single source of truth: the same `defineAction` code serves the UI, the agent, the CLI and MCP (`run-task` is an MCP tool).
- Agent chat with screen context; drift hand-off from the Tasks screen.
- `needsApproval` on reference approval and pipeline promotion.
- Framework observability traces supply the agent's real tokens, time and model calls; replays record zero.
- Durable background agent runs on Netlify; server-side hourly cap for the public demo agent.

## Honest limits

- The teaching run was guided: the prompt named the steps. The model executed them and wired the real table IDs; it did not discover the reconciliation logic.
- The CDSCO January steps were recorded by a script, not by an agent run. The references come from an independent plain-code implementation of the same written rules. Some published addresses have no comma after the company name, so those manufacturer names keep part of the address.
- Drift repair handles renamed columns and changed date formats only; anything else stops for a person.
- The public demo runs on free tiers (Netlify, Neon, Gemini free tier): the agent is capped at 8 requests per hour and can hit Google's "high demand" errors. Hosted replays take tens to ~140 ms because of database round trips; the 19.6 ms figure is from the laptop.
- No scheduling yet.

## Pre-existing work and team

Started 31 Oct 2026 from the MIT-licensed Agent-Native Chat template (Core 0.222.2); libraries are listed in `package.json`. Built with AI coding assistants under my direction. Team: Mohit Prajapati (solo).

## Links

- Public demo: https://rote-demo.netlify.app
- Repository: `[make public first, then paste URL]`
- Clips video: `[paste after recording]`

## Evidence

| Claim | Source |
| --- | --- |
| 42.1 s, 242,036 tokens, 12 model calls; 19.6 ms / 0 tokens replay; 2.3 ms drift stop; 34.3 ms fix | `docs/live-acceptance-2026-11-04.md`, `benchmark/live-acceptance.json` |
| 18/18 unseen weeks per sample task, median 2.5 ms and 1.6 ms, 3/3 drift cases stopped | `benchmark/results.json` (Apple M4, in-memory database) |
| CDSCO 218/217/190 rows; March replay matches the independent reference | `tests/cdsco.test.ts`, `docs/data-cdsco.md`; live demo run: 0 tokens, 138.2 ms |
| Demo agent used `run-task` instead of redoing the job | live demo chat, 4 Nov 2026: succeeded, ~110 ms, 0 tokens |

---

## Clips video script (target 2:30)

Record on https://rote-demo.netlify.app, logged out, in a fresh window, at least 20 minutes after any deploy. Run the full flow once before recording so nothing is cold.

| Time | Screen | Say |
| --- | --- | --- |
| 0:00–0:12 | Home, the "agent vs. approved pipeline" card | "Same data job. The agent took 42 seconds and 242 thousand tokens. Rote's approved pipeline did the next week in 19.6 milliseconds with zero tokens." |
| 0:12–0:25 | Point at the three rows | "This is Rote: teach the agent a job once, approve it, and never pay for it again. When the data changes, it stops instead of guessing." |
| 0:25–0:40 | Click **Start the guided demo**; Tasks screen opens | "The agent's steps were recorded as table actions. I review the output and approve it, then approve an unseen holdout week." Click both **Approve** buttons. |
| 0:40–1:05 | **Crystallize**, **Verify** | "Rote turns the recorded steps into a fixed plan, no generated code. It checks its own checker: an identical copy passes, a changed value fails. Both weeks match." Show "All rows match" badges. |
| 1:05–1:15 | **Approve and activate** | "I approve this exact version, bound to its hash." |
| 1:15–1:30 | **Run approved pipeline** | "Next week: replayed, zero model tokens." Hold on "0 model tokens · N ms". |
| 1:30–1:55 | **Teach the new format** → **bank changes its export** → **Run** → **Suggest a fix (no AI)** | "The bank renamed a column and changed its dates. Rote stops. It explains the change without a model, a rename and a date format, and I can approve it as version 2." |
| 1:55–2:15 | Home → **Run this week's payouts with the approved pipeline**; agent sidebar | "Ask the agent, and it doesn't redo the job. It finds the approved pipeline and calls run-task." Show the reply with 0 tokens. (Pre-record this part if the free model is busy.) |
| 2:15–2:30 | Tasks → CDSCO task already run; March "0 model tokens" | "It works on real data too: India's monthly drug-alert list, taught on January, verified on February, March replayed for free. Rote: teach it once." |

Tips: keep the cursor still while numbers are on screen; do not speed up the parts with numbers; do not claim the agent discovered the logic.

## Final checklist

- [ ] Demo opens in an incognito window without sign-in, banner visible, first load acceptable
- [ ] Payout and CDSCO flows run end to end on the demo the day of submission
- [ ] Demo agent answers the "run this week" prompt (or the video shows the pre-recorded take)
- [ ] Repository public; README complete; `.env.example` only; no secrets in history
- [ ] Clips link opens without login
- [ ] Every number in description, README and video is in the Evidence table
- [ ] Form submitted by 9 Nov 18:00 IST; receipt confirmed
- [ ] After judging (14 Nov): remove keep-warm from `netlify.toml`
