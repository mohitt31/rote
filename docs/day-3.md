# Day 3 implementation — finalized 1 November 2026

Work began on 31 October and was finalized on 1 November, ahead of the original 2 November milestone. The local product loop is implemented and exercised in automated tests with a mocked agent; the live model-and-human acceptance gate is still pending.

## Workflow

1. Open `/tasks` and prepare the sample payout demo. It creates three weeks of explicitly synthetic inputs, two independently generated reference tables, and a recorded transformation for week 1. This is deterministic preparation, not a model run.
2. Load training week 1, review its reference output, then approve that exact reference. Load and review holdout week 2 and approve it separately.
3. Crystallize: the app walks the approved training output's immutable step-log dependencies, including join branches. It replaces original input table IDs with named bindings and creates a versioned candidate. It does not read holdout rows or perform arbitrary date/constant generalization.
4. Verify: comparator self-checks must pass (identity passes, changed value/drop fail). Every frozen training and holdout example must match. Reference differences are available only through the authenticated UI action, not an agent tool.
5. Approve and activate the displayed version/hash. The framework gates `promote-pipeline` with `needsApproval: true` and its normal action audit. No separate custom audit table was introduced.
6. Load next week 3 and run the task. The replay engine executes allowlisted primitives without any model client. It persists output, version attribution and zero model-token usage. Schema drift or a recorded validation failure produces a drift record and no output.

The sample's recorded steps use a left join and validate non-null/unique payout IDs and a zero sum of squared deltas. Thus missing settlements or offsetting positive/negative amount mismatches cannot silently cancel. Its independent reference oracle uses the synthetic generator's promise of exact unbatched net settlements; it is not a real financial reconciliation oracle.

## Evidence and boundaries

Final checks: 76 tests across six suites passed; typecheck passed; framework doctor reported no findings. The internal workflow skill and app-skill manifest were validated.

- Integration tests exercise mocked agent calls → reviewed references → extract → verify → exact-hash promote → next-week replay in PGlite.
- Negative tests cover independent holdout requirements, shared source rejection, frozen references, cross-owner/org access, failed verification, stale/wrong hash, schema drift, and same-schema validation failure.
- Trace fixture tests verify ownership, organization, completed root status and cost-unit conversion. Actual framework trace totals are copied only for a single completed run that covers the full recorded lineage. Mixed/unavailable evidence stays manual with null metrics. Cost is in USD, copied from Core's hundredths-of-a-cent total divided by 10,000; this is provider metadata, not a payment receipt.
- Browser smoke checks preparation and review controls. Live human approvals remain pending. CLI promotion without approval was rejected before its handler ran; no approval override was used.
- Source and reference tables are immutable through product actions. References and tolerances freeze on first crystallization. Changing references currently requires another task. Pipelines are immutable; automated repair/editing is later work.
- Limits: 10 named inputs, 100 steps, 20 examples/task, 20 most recent versions and runs in task detail. Comparator tolerance limits from Day 2 still apply.
- Automatic model repair, arbitrary small-model parameter generalization, drift fallback, scheduling, savings benchmarks and deployment remain future work. Existing development React inline-script/sourcemap warnings remain unresolved.
- The local app-skill manifest uses the development URL only. Nothing was registered, published, pushed or deployed.

## Reproduce

```sh
./scripts/local pnpm typecheck
./scripts/local pnpm test
./scripts/local pnpm agent-native:doctor
```

Use `/tasks` for human approval buttons. Gated CLI calls must receive explicit human approval for the displayed exact arguments; never append an approval override merely to make a test pass. Service-level tests simulate approvals only inside isolated in-memory test databases.
