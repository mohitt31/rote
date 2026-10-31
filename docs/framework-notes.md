# Framework reconnaissance — 31 October 2026

Source of truth: the docs and compiled source shipped with Core **0.222.2**, not guessed APIs. Use `.agents/skills/agent-native-docs/SKILL.md` for lookup. The public getting-started page was checked before the package was available.

## Decisions

- Use `defineAction` with Zod. Framework transport is `/_agent-native/actions/<name>`; CLI is `pnpm action <name>`. Avoid bespoke REST wrappers.
- Keep Chat's native controller, context, and auth. Local dev sign-in creates a real development session. Do not introduce a second credential form.
- Canonical Google key: `GOOGLE_GENERATIVE_AI_API_KEY`; `GEMINI_API_KEY` is a supported alias. Groq uses `GROQ_API_KEY`. Engine and model are configurable using `AGENT_ENGINE` and `AGENT_MODEL`.
- Server `defineAppConfig` owns `agent.model` and `observability`. Capture tool args/results; keep raw table rows out of future action arguments and results. Keep optional model-based eval sampling at zero.
- Mutating actions automatically enter the framework audit log. Actor identity alone does not identify the human approver: promotion needs explicit version-bound approval provenance.
- `needsApproval: true` gates a specific call. CLI approval also requires a person's confirmation; never add `--approved` autonomously. Direct action `.run()` calls are not equivalent to dispatched authorization/approval checks.
- Comparator, goldens, holdout and tolerance must remain immutable to the repair loop. Use multiplicity-preserving canonical row comparisons; do not accidentally collapse duplicate rows.
- Stored Data Programs already exist. Our differentiation must be constrained step replay, independent verification and measured savings, not merely persistence of reusable transformations.
- Framework automations are normally agent-executed and natural-language conditions can invoke a model. Do not claim zero-token scheduled runs until a deterministic dispatch path is implemented and measured. Keep public demo LLM execution disabled server-side.
- Evals can be promoted from completed production traces using `agent-native eval promote <runId> --write evals/from-trace.eval.ts`. Do not invent trace IDs or output evidence.
- Local PGlite is fine for development. Deployments need persistent PostgreSQL. Neon supports pooled runtime connections and an optional unpooled migration URL. Migrations run before first production access, only with user approval.

## Pages reviewed for architecture/setup

`actions-overview`, `actions-defining`, `actions-access-control`, `actions-other-surfaces`, `context-awareness`, `observability`, `evals`, `data-programs`, `automations`, `audit-log`, `authentication`, `environment-variables`, `deployment`, `netlify`, `neon`.

Review the full relevant section again before implementing a future feature; reconnaissance does not validate an implementation.

## Gates

31 Oct: scaffold serves; actual agent calls `hello` and answers. The latter requires a user-provided, free-tier credential.

2 Nov night: payout core loop end to end. If missed, cut Restraint Report first and detailed drift version UI next, preserving the verifier, measured benchmark and live demo priorities.

9 Nov, 18:00 IST: internal submission target from the brief. Event facts are supplied by the user and were not independently reverified in this setup block.
