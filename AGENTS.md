# Chat — Agent Guide

Chat is the minimal chat-first agent-native app. `/` redirects to shared sign-in, then `/home`, the editable Get started page. Chat lives at `/chat`; new chats start there. Actions carry capabilities; screens exist only for durable workflows.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; the Get started page is `home` at `/home`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Building a domain app

Choose the primary workflow and route before editing. Add a domain route under `app/routes/` and set `app.homePath` in `server/plugins/agent-native-email-branding.ts` with `defineAppConfig`. The default Get started page lives at `/home`, and Chat stays at `/chat`; edit `app/routes/home.tsx` when replacing that page with a domain-specific home. Add a static link in `app/components/layout/Sidebar.tsx` before `ChatThreadsSection`; `Header.tsx` uses `APP_TITLE` elsewhere. Shared sidebar and AgentInspector remain.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here; do not rewrite `README.md` or `DESIGN.md`. After all edits, run one typecheck, one doctor check, and one browser smoke of the primary workflow, including overlap rejection, cancellation freeing the slot, and authenticated landing. Skip production build and extra test suites.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.

## Rote project rules

- Work only inside this checkout. Never print or commit secrets. Do not deploy, push, create a public repository, open upstream issues/PRs, or use paid services without Mohit's approval.
- Talk to Mohit in concise Hinglish; write code, docs, and submission material in English.
- Use `./scripts/local pnpm ...` for the project-local runtime. Core stays pinned at 0.222.2 unless a blocking upgrade is justified.
- Approval, verification, replay, deterministic drift repair (renames and date formats) and the restraint report are implemented. A guided live model run was accepted on 4 Nov 2026 (`docs/live-acceptance-2026-11-04.md`) and an unguided run is recorded in `docs/unguided-run-2026-11-05.md`. Automated model repair, model fallback and scheduling are not implemented. Never fabricate benchmark data or describe planned behavior as working.
- Before committing, typecheck and tests must pass. Commit identity: `git -c user.name="Mohit Prajapati" -c user.email="mohitprajapati3112@gmail.com" commit -m "..."`.
- User-requested README/progress documentation takes precedence over the generic template instruction not to rewrite README.

## Day 2 domain capabilities

- `/workbench` imports synthetic samples or local CSV/XLSX, previews bounded rows, executes immutable steps, and prepares authenticated CSV downloads.
- Public action names are kebab-case (Core CLI rejects underscores); internal step IDs retain the brief's snake_case names. All 15 implementations live in `server/rote/steps.ts` and their Zod schemas in `shared/rote/model.ts`.
- Every table and log read/write is scoped to owner email plus organization. Output table and step log are committed in one transaction. Never accept ownership from action arguments.
- `server/db/migrations.ts` contains additive named migrations. Do not rewrite an applied migration.
- Local multipart uploads are deliberately unavailable with DATABASE_URL or in production. Hosted storage must use configured framework attachment storage.
- Day 2 comparator is a tested pure function, not the complete verifier/approval product. The measured primitive benchmark excludes persistence and model work.

## Day 3 workflow

Read `.agents/skills/rote-pipelines/SKILL.md` when working on recorded pipelines. `/tasks` is the review and replay screen. The guided live acceptance run is recorded in `docs/live-acceptance-2026-11-04.md`; do not claim a synthetic, script-recorded or manual run was an agent run.

| Action | Purpose |
| --- | --- |
| `create-task` | Establish task name and immutable numeric tolerances |
| `prepare-payout-sample` | Prepare three synthetic payout weeks (`scenario`: `batched` default, or `basic`) and a recorded training sequence; grants no approvals |
| `prepare-vendor-sample` | Same for the synthetic vendor price-list cleanup task (input name `prices`) |
| `parameterize-pipeline` | Turn existing scalar step values into typed named parameters in a new unverified version |
| `approve-example` | Human approves exact named inputs, source lineage and reference output; `needsApproval: true` |
| `crystallize-task` | Extract immutable allowlisted DAG from training step logs; freeze references |
| `verify-pipeline` | Self-test comparator, replay training and independent holdout |
| `promote-pipeline` | Human approves exact candidate hash; activate verified version through audited action |
| `run-task` | Zero-model replay with drift refusal and persisted metrics/version attribution; also an MCP tool (`mcpTool: true`) with `list-tasks`, `get-task`, `list-tables` |
| `list-tasks`, `get-task` | Scoped metadata, versions and run history |
| `get-verification-diff` | Proven app UI only; bounded reference differences, not an agent/MCP tool |
| `prepare-format-change-sample` | Synthetic "bank changes its export" weeks 4–6 for an existing payout task |
| `prepare-cdsco-task` | Real public CDSCO NSQ data (Jan–Mar 2026); January steps recorded by script, independent references; grants no approvals |
| `propose-drift-fix` | After a drift stop, explain renamed columns and changed date formats without a model and re-run the recorded steps; approves nothing |
| `get-restraint-report` | Group traced agent runs by the step actions they used, with token/time totals, and show which are covered by an approved pipeline |
| `get-demo-status` | Public demo flag, next reset time and the demo agent's remaining hourly turns (UI only) |

Trace projections in `server/rote/trace-evidence.ts` are read-only views of Core-owned schema, verified against pinned 0.222.2 source. Do not migrate framework tables. The public package does not export its observability store. Missing, mixed or incomplete trace evidence remains a manual run with null agent metrics. Step-log extraction is the documented fallback to captured framework traces.
