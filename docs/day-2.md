# Day 2 implementation — 31 October 2026

The user requested the Day 2 milestone early. This implements the 1 November milestone from the brief; it does not change the actual date.

## Delivered

- Fifteen deterministic steps, with Zod input/output validation, declared action errors, immutable table outputs and transactional step logs. Public action names use kebab-case because Core 0.222.2 rejects underscore names in its CLI; internal primitive IDs remain snake_case.
- CSV and single-sheet, values-only XLSX imports, scoped previews and authenticated CSV export. CSV strings preserve leading zeros until explicitly parsed. Null and empty text remain distinct in SQL; CSV export cannot preserve that distinction. Formula-like strings receive an apostrophe on export to protect spreadsheet opening.
- Local uploads accept at most 5 MiB. XLSX preflight bounds actual decompression to 25 MiB and 2,000 archive members. Formula, rich-text, hyperlink and error cells are rejected. Hosted uploads require a configured framework storage adapter; the local adapter intentionally refuses production and DATABASE_URL.
- Nine Drizzle tables and named migration v1 for workspaces, files, tables, tasks, runs, golden examples, pipelines, verifications and step logs. Future product tables are schema preparation, not implemented workflows.
- `/workbench` uses shared action hooks, exposes sample import, preview, all fifteen steps and CSV export. Selection is available through `view-screen` with ownership checks.
- Deterministic generators create 20 payout/bank pairs (40 CSV files) and 20 vendor files under ignored `data/sample/`. They are synthetic. Payouts include refunds and fees; the current generator does not simulate batched or delayed bank settlements.
- A duplicate-aware row-multiset comparator with bounded diffs, explicit per-column numeric tolerances, non-greedy matching, and corrupt/drop self-checks. Tolerant comparison is capped at 1,000 rows. This is groundwork for the later verifier.

## Verification

Unit and PGlite integration tests cover all fifteen steps, CSV/XLSX handling, safe formula parsing, comparator edge cases, scope isolation, transaction rollback and persisted payout reconciliation. Browser smoke verified authenticated sample import, preview, parse_number creating a distinct output table, and export-link creation. CLI `import-file` successfully imported 25 sample payouts. Typecheck and framework doctor checks pass.

The retained scaffold emits a React inline-script warning during client rendering, plus dependency sourcemap warnings in development. Consequently this milestone does not claim a clean console. Real agent answering remains unverified pending a valid replacement credential supplied privately in `.env`; no inference or paid usage was used for these deterministic checks. The complete agent → approve → crystallize → verify → promote → replay loop remains Day 3 work.

## Measured primitive performance

`benchmark/primitives.json` records one warmup and 20 measured runs of six in-memory steps over 10,000 synthetic rows, including runtime/machine metadata and individual durations. Recorded median: 13.62 ms; p95: 16.32 ms. This excludes parsing, database persistence, HTTP and UI. It does not establish the full pipeline latency target or agent-versus-pipeline savings.

## Reproduce

```sh
./scripts/local pnpm exec tsx scripts/gen-payouts.ts
./scripts/local pnpm exec tsx scripts/gen-vendors.ts
./scripts/local pnpm exec tsx scripts/benchmark-primitives.ts
./scripts/local pnpm test
./scripts/local pnpm typecheck
./scripts/local pnpm agent-native:doctor
./scripts/local pnpm action import-file '{"source":{"kind":"sample","dataset":"payouts","week":1}}'
```

Open `/workbench`, import Sample payouts and run the default parse_number parameters. The input remains available in the table list. Use the resulting table ID for additional actions. JSON parameters are an engineering workbench; guided task and verification screens are future work.
