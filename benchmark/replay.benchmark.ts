// Persisted replay benchmark on the synthetic payout and vendor samples.
// Run with: ./scripts/local pnpm benchmark
// It records only numbers measured by this run. Agent-mode numbers are written
// only from completed framework traces; none exist in this harness.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform } from "node:os";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { migrations } from "../server/db/migrations.js";
import * as schema from "../server/db/schema.js";

let pg: PGlite, db: ReturnType<typeof drizzle<typeof schema>>;
vi.mock("../server/rote/trace-evidence.js", () => ({
  traceEvidence: vi.fn(async () => null),
}));
vi.mock("../server/db/index.js", () => ({ getDb: () => db, schema }));

import { prepareBatchedSample } from "../server/rote/batched-sample.js";
import { compareTables } from "../server/rote/comparator.js";
import { parseFile } from "../server/rote/io.js";
import { readTable, saveImport } from "../server/rote/repository.js";
import { prepareVendorSample } from "../server/rote/vendor-sample.js";
import {
  approveExample,
  crystallizeTask,
  promotePipeline,
  runTask,
  verifyPipeline,
} from "../server/rote/workflow.js";
import type { Table } from "../shared/rote/model.js";
import {
  batchedPayoutSample,
  vendorCleanupSample,
} from "../shared/rote/samples.js";

const scope = { ownerEmail: "benchmark@example.test", orgId: null };
const FIRST_UNSEEN = 3,
  LAST_WEEK = 20;

beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema });
  for (const m of migrations) await pg.exec(m.sql);
}, 30000);
afterAll(async () => pg.close());

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const pct = (sorted: number[], p: number) =>
  sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ]!;
type Mutate = (input: string, t: Table) => Table;
type Spec = {
  key: string;
  label: string;
  prepare: typeof prepareBatchedSample;
  files: (week: number) => Record<string, string>;
  expected: (week: number) => Table;
  drift: [string, Mutate][];
};

async function importWeek(spec: Spec, week: number, mutate?: Mutate) {
  const inputs: Record<string, string> = {};
  for (const [name, csv] of Object.entries(spec.files(week))) {
    const parsed = await parseFile(Buffer.from(csv), `${name}.csv`);
    const table = mutate ? mutate(name, parsed) : parsed;
    const saved = await saveImport(table, `bench-${name}-${week}`, scope, {
      sha256: sha(JSON.stringify(table)),
      sample: true,
    });
    inputs[name] = saved.outputTableId;
  }
  return inputs;
}

const only =
  (input: string, f: (t: Table) => Table): Mutate =>
  (name, t) =>
    name === input ? f(t) : t;
const bumpLastDigit = (v: unknown) =>
  String(v).replace(/\d(?=\D*$)/, (d) => String((Number(d) + 1) % 10));

const specs: Spec[] = [
  {
    key: "payouts",
    label: "Batched payout reconciliation",
    prepare: prepareBatchedSample,
    files: (w) => {
      const s = batchedPayoutSample(w);
      return { payouts: s.payouts, bank: s.bank };
    },
    expected: (w) => batchedPayoutSample(w).expected,
    drift: [
      [
        "bank renamed amount_minor → amount",
        only("bank", (t) => ({
          columns: t.columns.map((c) => (c === "amount_minor" ? "amount" : c)),
          rows: t.rows.map(({ amount_minor, ...r }) => ({
            ...r,
            amount: amount_minor ?? null,
          })),
        })),
      ],
      [
        "bank switched to ISO booking dates",
        only("bank", (t) => ({
          ...t,
          rows: t.rows.map((r) => ({
            ...r,
            booking_date: String(r.booking_date).replace(
              /(\d{2})\/(\d{2})\/(\d{4})/,
              "$3-$2-$1",
            ),
          })),
        })),
      ],
      [
        "one bank amount off by 1 cent",
        only("bank", (t) => ({
          ...t,
          rows: t.rows.map((r, i) =>
            i === 0 ? { ...r, amount_minor: bumpLastDigit(r.amount_minor) } : r,
          ),
        })),
      ],
    ],
  },
  {
    key: "vendors",
    label: "Vendor price-list cleanup",
    prepare: prepareVendorSample,
    files: (w) => ({ prices: vendorCleanupSample(w).csv }),
    expected: (w) => vendorCleanupSample(w).expected,
    drift: [
      [
        "new unit code (dozen)",
        only("prices", (t) => ({
          ...t,
          rows: t.rows.map((r, i) => (i === 0 ? { ...r, UOM: "dozen" } : r)),
        })),
      ],
      [
        "header renamed Unit Price → Price",
        only("prices", (t) => ({
          columns: t.columns.map((c) => (c === "Unit Price" ? "Price" : c)),
          rows: t.rows.map(({ "Unit Price": price, ...r }) => ({
            ...r,
            Price: price ?? null,
          })),
        })),
      ],
      [
        "conflicting duplicate SKU price",
        only("prices", (t) => ({
          ...t,
          rows: [...t.rows, { ...t.rows[1]!, "Unit Price": "$1.00" }],
        })),
      ],
    ],
  },
];

async function measure(spec: Spec) {
  const teachStart = performance.now();
  const fixture = await spec.prepare(scope);
  await approveExample(
    {
      taskId: fixture.taskId,
      inputs: fixture.training.inputs,
      outputTableId: fixture.training.outputTableId!,
      sourceOutputTableId: fixture.training.sourceOutputTableId!,
      holdout: false,
    },
    scope,
  );
  await approveExample(
    {
      taskId: fixture.taskId,
      inputs: fixture.holdout.inputs,
      outputTableId: fixture.holdout.outputTableId!,
      holdout: true,
    },
    scope,
  );
  const candidate = await crystallizeTask(fixture.taskId, scope);
  const verification = await verifyPipeline(candidate.id, scope);
  expect(verification.pass).toBe(true);
  await promotePipeline(candidate.id, candidate.hash, scope);
  const teachMs = performance.now() - teachStart;

  // One warm-up replay (not counted), then every unseen week.
  await runTask(fixture.taskId, await importWeek(spec, FIRST_UNSEEN), scope);
  const weeks = [];
  for (let week = FIRST_UNSEEN; week <= LAST_WEEK; week++) {
    const out = await runTask(
      fixture.taskId,
      await importWeek(spec, week),
      scope,
    );
    const expected = spec.expected(week);
    weeks.push({
      week,
      rows: expected.rows.length,
      durationMs: out.durationMs,
      status: out.status,
      matchesReference:
        out.status === "succeeded" &&
        compareTables(expected, await readTable(out.outputTableId!, scope))
          .pass,
    });
  }
  const drift = [];
  for (const [name, mutate] of spec.drift) {
    const out = await runTask(
      fixture.taskId,
      await importWeek(spec, LAST_WEEK, mutate),
      scope,
    );
    drift.push({
      case: name,
      status: out.status,
      outputWritten: out.outputTableId !== null,
      message: out.message,
    });
  }
  const ms = weeks.map((w) => w.durationMs).sort((a, b) => a - b);
  return {
    key: spec.key,
    label: spec.label,
    teach: {
      description:
        "Prepare recorded week-1 steps, approve training (week 1) and holdout (week 2), crystallize, verify, promote",
      durationMs: teachMs,
      verificationPassed: verification.pass,
    },
    replay: {
      description:
        "run-task per unseen week: read inputs from SQL, fingerprint check, deterministic replay, persist output and run record",
      weeks: weeks.length,
      warmupRuns: 1,
      matchesIndependentReference: weeks.filter((w) => w.matchesReference)
        .length,
      medianMs: pct(ms, 50),
      p95Ms: pct(ms, 95),
      modelCalls: 0,
      modelTokens: 0,
      perWeek: weeks,
    },
    drift: {
      cases: drift.length,
      stoppedWithoutOutput: drift.filter(
        (d) => d.status === "drift" && !d.outputWritten,
      ).length,
      details: drift,
    },
  };
}

it("teaches once, then replays unseen weeks and stops on drift", async () => {
  const tasks = [];
  for (const spec of specs) tasks.push(await measure(spec));
  const result = {
    label:
      "Persisted replay benchmark on SAMPLE data generated by shared/rote/samples.ts. Not real customer data.",
    date: new Date().toISOString(),
    machine: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      node: process.version,
    },
    database: "in-memory PGlite (same migrations as the app)",
    tasks,
    agent: {
      measured: false,
      reason:
        "No completed, traced agent run exists in this harness. Agent tokens, cost and duration are reported only from framework traces of a real model run.",
    },
  };
  const md = [
    "# Rote replay benchmark",
    "",
    `Sample data only. ${result.date} · ${result.machine.cpu ?? "unknown CPU"} · Node ${result.machine.node} · ${result.database}.`,
    "",
    "| Task | Teach once | Unseen weeks correct | Replay median / p95 | Model tokens per replay | Drift stopped |",
    "| --- | --- | --- | --- | --- | --- |",
    ...tasks.map(
      (r) =>
        `| ${r.label} | ${r.teach.durationMs.toFixed(0)} ms | ${r.replay.matchesIndependentReference}/${r.replay.weeks} | ${r.replay.medianMs.toFixed(1)} / ${r.replay.p95Ms.toFixed(1)} ms | 0 | ${r.drift.stoppedWithoutOutput}/${r.drift.cases} |`,
    ),
    "",
    "Agent-only runs (tokens, cost, time): not measured yet; they require a real traced model run.",
    "",
    ...tasks.map(
      (r) =>
        `Drift cases, ${r.label}: ` +
        r.drift.details.map((d) => `${d.case} → ${d.message}`).join("; ") +
        ".",
    ),
    "",
    "Teach once = prepare recorded week-1 steps → approve training and holdout → crystallize → verify → promote. Replay = persisted `run-task` per unseen week (weeks 3–20), checked against the generator's independent reference.",
    "",
    "Reproduce: `./scripts/local pnpm benchmark`. Raw numbers: `benchmark/results.json`.",
    "",
  ].join("\n");
  await mkdir("benchmark", { recursive: true });
  await writeFile(
    "benchmark/results.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  await writeFile("benchmark/results.md", md);
  console.log(md);
  for (const r of tasks) {
    expect(r.replay.matchesIndependentReference).toBe(r.replay.weeks);
    expect(r.drift.stoppedWithoutOutput).toBe(r.drift.cases);
  }
}, 120000);
