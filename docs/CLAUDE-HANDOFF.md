# Rote — complete continuation handoff to Claude

Prepared for Mohit on **4 November 2026 (IST)**. Read this before resuming. This document supersedes older progress notes where they disagree about live acceptance.

## Start here

- Repository: https://github.com/mohitt31/rote (private).
- Unified handoff branch: `codex/claude-handoff-2026-11-04`.
- Laptop checkout: `/Users/mohit/rote`.
- Existing Claude PR: https://github.com/mohitt31/rote/pull/1, branch `claude/tender-hypatia-v10zsh`, head inspected `7a30364c12158e006797a534286f62c1a96e7389`. It was open, draft and unmerged when checked.
- This handoff branch combines local work through `f81e7cf`, local live-agent fixes/acceptance record (`15b960c`), and the entire PR head above. Do not start again from old `main`, blindly pull the PR into a dirty checkout, or discard either branch's work.
- Read `AGENTS.md`, `docs/brief.md`, `.agents/skills/rote-pipelines/SKILL.md`, `docs/day-1-live-acceptance.md`, then this document. For framework APIs use installed version-matched docs/source.
- Speak concise Hinglish to Mohit; code and documentation in English.

## User intent and authorization

Mohit wants the Day 1–3 work genuinely completed to a high standard, then the full hackathon submission, and explicitly requested transfer of all progress to Claude. He needs simple step-by-step instructions for account setup and human review. Do engineering work autonomously before asking for a concrete final approval.

Work inside `/Users/mohit/rote`; local installs, tests, edits and commits are allowed. Private GitHub push and this transfer are authorized. Do not force-push. Publishing the repo, deployment/host changes, paid plans, global tools, modifications outside the checkout, upstream PRs/issues and final submission need separate authorization. Do not create accounts or enter passwords for him.

The Google key is in the laptop's ignored `.env`; Mohit confirmed it is a replacement key on a Free Tier / billing-disabled project. A real hello run succeeded. NEVER print, paste, commit or transfer credentials. Earlier keys were exposed in chat and replacement was requested; do not recover/reuse those. Cloud Claude does not automatically have the laptop key or local database. Do not request a key in chat; use local execution for live testing.

Commit identity:
`git -c user.name="Mohit Prajapati" -c user.email="mohitprajapati3112@gmail.com" commit ...`

## What is implemented

- Agent-Native Core pinned `0.222.2`, local Node `22.22.0`, pnpm via `scripts/local` and `scripts/bootstrap`.
- Fifteen deterministic table steps, safe formula parser (no eval), RE2JS regex, explicit date/number formats, joins, aggregation, validation.
- Scoped immutable CSV/XLSX imports, table previews, downloads and step logs. XLSX values only; bounded compressed/expanded size. CSV formula-like strings escaped. Real browser XLSX upload/download contents were checked on 1 November.
- Tasks and independently approved training/holdout references; recorded-lineage DAG extraction; canonical hashes; comparator self-checks; frozen verification; exact-hash approval-gated promotion; zero-model replay with persisted output/run attribution; drift refusal.
- Typed scalar parameter generalization creates a new candidate requiring verification, not arbitrary generated code.
- Synthetic batched payout samples include refunds, integer-cent fees, reordered bank statements and 1–3 calendar-day date windows. Vendor cleanup and independent sample references are included.
- Guided five-step Tasks UI, table pickers and previews, verification differences, cost card based on recorded data, overview page, version comparison, changed-format re-teaching with generation-specific references.
- PR includes holdout access guards, CLI/MCP exposure, drift handoff to chat, public-demo flag with server-side agent refusal and lazy hourly reset, deployment guide, submission draft and a CDSCO fetch script.
- Public demo is code only: nothing was deployed or made public by this handoff.

## Fresh validation of the combined branch

Run on the laptop during this handoff:

- `./scripts/local pnpm test`: **89 tests, 11 suites passed**.
- `./scripts/local pnpm typecheck`: **passed**.
- `./scripts/local pnpm agent-native:doctor`: **clean, no findings**.
- `./scripts/local pnpm benchmark`: **passed**, both tasks **18/18** unseen weeks correct; drift **3/3** stopped for each task.
- New benchmark artifacts are `benchmark/results.json` and `benchmark/results.md`. Apple M4, Node 22.22.0, in-memory PGlite. Payout replay median/p95 rounded **2.7/3.5 ms**; vendor **1.5/2.2 ms**. These include SQL-backed service execution in an in-memory database, not disk durability, HTTP or UI. They are small synthetic fixtures, NOT a 10k-row end-to-end result or an agent-versus-pipeline speedup.
- `benchmark/primitives.json` separately measures six pure transformations on 10k rows, excluding persistence (median ~13.62 ms, p95 ~16.32 ms).
- The combined branch has not received a fresh full browser smoke, deployment check or live model reconciliation run. Do not describe tests as proving those.

Local logs: `work/handoff-combined-tests.log`, `work/handoff-combined-typecheck.log`, `work/handoff-combined-doctor.log`, `work/handoff-benchmark.log`. They stay ignored. The disk was critically low at the start (~475 MB, briefly ~116 MB), then doctor reported ~1.4 GB free. Check before heavy installs; do not delete unrelated files.

## Real agent evidence and failures — do not blur these

### Day 1 PASS

On 1 November, the browser used Gemini 3.1 Flash-Lite, called `hello` with `{"name":"Mohit"}`, returned `{"message":"Hello, Mohit!"}`, and answered accordingly. Expanded tool input/result verified. Chat:
`http://127.0.0.1:8080/chat/chat-f6b15f71-7239-4f79-9dee-88bd18b2f00a`

UI showed one call and rounded 4 seconds. Estimated US$0.0032 is framework pricing metadata, not a bill. `docs/day-1-live-acceptance.md` records the proof. Never downgrade this to 'key not configured', but recheck current readiness if needed.

### Day 3 still pending

1. First attempted reconciliation failed because Gemini rejects empty-string enum members in tool schemas.
2. Local fix used a string refinement; Claude independently added a better explicit `none` option with legacy empty-string preprocessing. The merged branch retains Claude's schema/implementation/tests, plus local formula syntax guidance.
3. CLI-prepared inputs belonged to `orgId:null`; browser's Dev workspace had another scope. The model could not read those IDs, then substituted other tables despite the prompt and made formula errors. This is a failed run, NOT valid teaching evidence. A 429 free-tier input-token-per-minute limit was also observed (250000 in that particular response). Do not generalize that quota to all projects or upgrade billing.
4. Fixed instructions to stop on missing IDs, preload all step tools, require bracketed formula references (`[net_cents] - [amount_minor]`) and `params.rightTableId`; prohibited run-code for row transformations.
5. Prepared samples through the browser in the correct workspace and launched a NEW, explicitly guided run. It was observed reaching compute-column. Its final result, final output ID and complete successful trace were **not verified before interruption**. On 4 November no server was listening on 8080, and the saved browser tab only showed Loading application. Do not infer success from elapsed time or partial tool calls.

Failed chat: `/chat/chat-99527837-cc0c-449b-ae70-63a1001fa7f8`.
Latest guided chat: `/chat/chat-b2d9d6f0-b410-4970-b618-5b9efce4c611`.
The latest prompt gives exact transformation instructions; even if successful, describe it as a **guided real-model execution**, not independently discovered reconciliation logic.

## Resume the exact local task

Browser task: `http://127.0.0.1:8080/tasks?task=f7f92e2c-c0a1-4f66-8b27-b750c19fa4a3`.

| Purpose | Table ID |
| --- | --- |
| Training payouts | `7c1887a2-f53a-4b70-958a-70b68257cbb9` |
| Training bank | `429ac7e4-fb23-473b-b125-fb9f0026befb` |
| Independent training reference | `5197cb41-20d7-49cb-b319-16ccd88a42f4` |
| Fixture-generated source (NOT agent output) | `ccc344f5-c0f8-4377-aa43-0da9c81c7409` |
| Holdout payouts | `2b595641-909d-460c-97ce-cb81bce55b18` |
| Holdout bank | `6dbc2b81-9d98-4a32-8159-c0d4d4efe9e1` |
| Holdout reference | `878a1187-7e05-446b-8480-ddb7832770a6` |
| Next-week payouts | `496a805a-a2aa-4603-a3d7-94efaaeca166` |
| Next-week bank | `96d256da-552b-4e72-a061-b4640d300efd` |

These are laptop-only IDs, not portable cloud fixtures. Verify ownership and current existence. Never pass holdout reference rows to the model. The original form's source selection points at fixture output: replace it with the verified actual agent output before requesting training approval. Do not silently approve the fixture and label it an agent run.

Recipe: parse numeric cents on both branches, parse payout yyyy-MM-dd and bank dd/MM/yyyy in UTC; group payouts by settlement_id+expected_date with sum net_cents and transaction count; validate unique/non-null bank reference/amount/date; left join matching settlement_id/reference within 3 days; compute delta_cents and squared_delta; validate non-null matched amounts, unique settlement IDs and sum(squared_delta)=0; select settlement_id, net_cents, amount_minor, transaction_count, delta_cents. Reference has eight rows from 25 transactions. Formula references use brackets. Check each returned output ID.

Human approval is still pending. The skill explicitly says: 'The human must approve the specific call. Never grant approval yourself or use a CLI approval override without that approval.' Prepare the exact review screen and ask Mohit to review training, then holdout, then the verified hash. Service tests simulate approvals only in isolated databases.

## Next actions, in order

1. Check disk and branch; preserve `.env` and local data. Run the combined branch locally with `./scripts/local pnpm exec agent-native dev --host 127.0.0.1 --port 8080 --strictPort`. Do not start a second PGlite owner; inspect listeners/processes first.
2. Inspect the latest guided chat and actual step logs/trace. If incomplete, rerun with correct browser-scoped inputs and bounded retries; never substitute unrelated tables. Account for free-tier quotas without paid fallback.
3. Verify actual output against the independent training reference. Ensure successful single-run trace linkage: mixed/missing/failed traces must remain manual with unknown metrics. `server/rote/trace-evidence.ts` uses scoped read-only projections of Core tables.
4. Prepare human review with actual agent source output, receive exact approvals, crystallize, verify, promote, replay week 3. Record real tokens/time from completed traces and confirm zero model calls for replay.
5. Browser-smoke the merged guided flow, holdout protection, v2 re-teach and public-demo behavior. Known React inline-script warnings reappeared during navigation; do not claim universally clean console.
6. Measure full 10k-row persisted pipeline performance; do not reuse small-fixture or primitive-only numbers as that proof. Real agent baseline is still missing.
7. Later scope still pending: repair loop, scheduling, eval promotion, real CDSCO task/data, private/public deployment, public Clips recording, Slides, repo publication and final submission. `docs/deploy.md` and `docs/submission.md` are guides/drafts, not completion evidence. Confirm current event rules/deadlines on official pages before submission; original brief's strategy/win probabilities are not verified facts.

## Local data and safety details

The transfer intentionally excludes `.env`, `.bootstrap`, `node_modules`, `work`, `.agent-native`, local databases, sessions and uploads. Those remain on Mohit's laptop; source generators and migrations recreate synthetic data in a new environment. Do not upload database/auth stores or raw logs just to make a cloud session match the laptop.

Use actions for normal app data. Scope all reads/writes by owner and org. Keep migrations additive; v5 from Claude is now included. Never change references/checks/tolerances to obtain a green verification. Pipeline hashes bind immutable plans. No auto repair or fallback is proven. When checking model costs distinguish estimated list-price telemetry from actual free-tier billing.

Avoid editing/restarting server files during an active agent turn. There are no intentionally active background agent runs from this handoff. No external messages, deployment, public release or PR approval were performed as part of packaging.
