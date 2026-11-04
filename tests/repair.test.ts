import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, afterAll, it, expect, vi } from "vitest";

import { migrations } from "../server/db/migrations.js";
import * as schema from "../server/db/schema.js";
let pg: PGlite, db: ReturnType<typeof drizzle<typeof schema>>;
vi.mock("../server/rote/trace-evidence.js", () => ({
  traceEvidence: vi.fn(async () => null),
}));
vi.mock("../server/db/index.js", () => ({ getDb: () => db, schema }));
import {
  bankExportV2,
  prepareBankFormatChange,
  prepareBatchedSample,
} from "../server/rote/batched-sample.js";
import { compareTables } from "../server/rote/comparator.js";
import { parseFile } from "../server/rote/io.js";
import {
  detectDateFormat,
  pairRenames,
  proposeDriftFix,
} from "../server/rote/repair.js";
import { readTable, saveImport } from "../server/rote/repository.js";
import {
  approveExample,
  crystallizeTask,
  promotePipeline,
  runTask,
  verifyPipeline,
} from "../server/rote/workflow.js";
import { batchedPayoutSample } from "../shared/rote/samples.js";

const scope = { ownerEmail: "repair@example.test", orgId: "team" };
beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema });
  for (const m of migrations) await pg.exec(m.sql);
}, 20000);
afterAll(async () => pg.close());

async function promotedV1() {
  const v1 = await prepareBatchedSample(scope);
  await approveExample(
    {
      taskId: v1.taskId,
      inputs: v1.training.inputs,
      outputTableId: v1.training.outputTableId!,
      sourceOutputTableId: v1.training.sourceOutputTableId!,
      holdout: false,
    },
    scope,
  );
  await approveExample(
    {
      taskId: v1.taskId,
      inputs: v1.holdout.inputs,
      outputTableId: v1.holdout.outputTableId!,
      holdout: true,
    },
    scope,
  );
  const p = await crystallizeTask(v1.taskId, scope);
  expect((await verifyPipeline(p.id, scope)).pass).toBe(true);
  await promotePipeline(p.id, p.hash, scope);
  return v1;
}

async function importWeek(week: number, mutate: (bank: ReturnType<typeof bankExportV2>) => ReturnType<typeof bankExportV2>, tag: string) {
  const sample = batchedPayoutSample(week);
  const payouts = await parseFile(Buffer.from(sample.payouts), "p.csv");
  const bank = mutate(await parseFile(Buffer.from(sample.bank), "b.csv"));
  const p = await saveImport(payouts, `p-${tag}-${week}`, scope, {
    sha256: `p-${tag}-${week}`,
    sample: true,
  });
  const b = await saveImport(bank, `b-${tag}-${week}`, scope, {
    sha256: `b-${tag}-${week}`,
    sample: true,
  });
  return { payouts: p.outputTableId, bank: b.outputTableId };
}

it("pairs a renamed column by value kind and refuses ambiguous pairs", () => {
  const expected = {
    columns: ["ref", "amount_minor", "booking_date"],
    rows: [{ ref: "a", amount_minor: "100", booking_date: "01/02/2026" }],
  };
  const renamed = {
    columns: ["ref", "amount_cents", "booking_date"],
    rows: [{ ref: "a", amount_cents: "100", booking_date: "01/02/2026" }],
  };
  expect(pairRenames(expected, renamed).mapping).toEqual({
    amount_cents: "amount_minor",
  });
  const twoNumbers = {
    columns: ["ref", "x", "y", "booking_date"],
    rows: [{ ref: "a", x: "1", y: "2", booking_date: "01/02/2026" }],
  };
  expect(pairRenames(expected, twoNumbers).reason).toMatch(/more than one/);
});

it("detects a single changed date format and refuses ambiguous dates", () => {
  const iso = {
    columns: ["d"],
    rows: [{ d: "2026-01-31" }, { d: "2026-02-14" }],
  };
  expect(detectDateFormat(iso, "d", "UTC").format).toBe("yyyy-MM-dd");
  const ambiguous = { columns: ["d"], rows: [{ d: "01/02/2026" }] };
  expect(detectDateFormat(ambiguous, "d", "UTC").reason).toMatch(
    /several formats/,
  );
});

it("repairs a renamed column and changed date format without a model, then re-teaches v2", async () => {
  const v1 = await promotedV1();
  const v2 = await prepareBankFormatChange(v1.taskId, scope);
  // v1 stops on the new export format.
  expect((await runTask(v1.taskId, v2.training.inputs, scope)).status).toBe(
    "drift",
  );
  const fix = await proposeDriftFix(v1.taskId, v2.training.inputs, scope);
  expect(fix.status).toBe("proposed");
  if (fix.status !== "proposed") throw Error("unreachable");
  expect(fix.modelCalls).toBe(0);
  expect(fix.changes).toEqual([
    { kind: "rename", input: "bank", from: "amount_cents", to: "amount_minor" },
    {
      kind: "date_format",
      input: "bank",
      column: "booking_date",
      from: ["dd/MM/yyyy"],
      to: "yyyy-MM-dd",
    },
  ]);
  // The repaired output matches the week's independent reference.
  expect(
    compareTables(
      batchedPayoutSample(4).expected,
      await readTable(fix.sourceOutputTableId, scope),
    ).pass,
  ).toBe(true);

  // A person approves the repaired run as the v2 training example; v2 then
  // goes through the usual frozen verification and exact-hash promotion.
  await approveExample(
    {
      taskId: v1.taskId,
      inputs: v2.training.inputs,
      outputTableId: v2.training.outputTableId!,
      sourceOutputTableId: fix.sourceOutputTableId,
      holdout: false,
      retrain: true,
    },
    scope,
  );
  await approveExample(
    {
      taskId: v1.taskId,
      inputs: v2.holdout.inputs,
      outputTableId: v2.holdout.outputTableId!,
      holdout: true,
    },
    scope,
  );
  const p2 = await crystallizeTask(v1.taskId, scope);
  expect((await verifyPipeline(p2.id, scope)).pass).toBe(true);
  await promotePipeline(p2.id, p2.hash, scope);
  const next = await runTask(v1.taskId, v2.next.inputs, scope);
  expect(next.status).toBe("succeeded");
  expect(
    compareTables(
      batchedPayoutSample(6).expected,
      await readTable(next.outputTableId!, scope),
    ).pass,
  ).toBe(true);
});

it("refuses value changes and reports them instead of guessing", async () => {
  const v1 = await promotedV1();
  const offByOne = await importWeek(
    7,
    (bank) => ({
      ...bank,
      rows: bank.rows.map((r, i) =>
        i === 0
          ? { ...r, amount_minor: String(Number(r.amount_minor) + 1) }
          : r,
      ),
    }),
    "cent",
  );
  const fix = await proposeDriftFix(v1.taskId, offByOne, scope);
  expect(fix.status).not.toBe("proposed");
  const missing = await importWeek(
    8,
    (bank) => ({
      columns: bank.columns.filter((c) => c !== "amount_minor"),
      rows: bank.rows.map(({ amount_minor: _drop, ...r }) => r),
    }),
    "drop",
  );
  const gone = await proposeDriftFix(v1.taskId, missing, scope);
  expect(gone.status).toBe("unsupported");
  if (gone.status === "unsupported")
    expect(gone.reason).toMatch(/amount_minor/);
});
