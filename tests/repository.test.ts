import { PGlite } from "@electric-sql/pglite";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, afterAll, it, expect, vi } from "vitest";

import { migrations } from "../server/db/migrations.js";
import * as schema from "../server/db/schema.js";
let pg: PGlite, db: ReturnType<typeof drizzle<typeof schema>>;
vi.mock("../server/db/index.js", () => ({ getDb: () => db, schema }));
import { compareTables } from "../server/rote/comparator.js";
import { parseFile } from "../server/rote/io.js";
import {
  saveImport,
  readTable,
  runStep,
  listTables,
} from "../server/rote/repository.js";
import { payoutSample } from "../shared/rote/samples.js";
const alice = { ownerEmail: "alice@example.test", orgId: "org-a" },
  bob = { ownerEmail: "bob@example.test", orgId: "org-a" };
beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema });
  for (const m of migrations) await pg.exec(m.sql);
}, 20000);
afterAll(async () => {
  await pg.close();
});
it("persists imports and scopes reads by both owner and org", async () => {
  const t = await saveImport(
    { columns: ["x"], rows: [{ x: 1 }] },
    "sample",
    alice,
    { sha256: "test", sample: true },
  );
  expect((await readTable(t.outputTableId, alice)).rows).toEqual([{ x: 1 }]);
  await expect(readTable(t.outputTableId, bob)).rejects.toThrow(/not found/);
  await expect(
    readTable(t.outputTableId, { ...alice, orgId: "org-b" }),
  ).rejects.toThrow();
  await expect(
    readTable(t.outputTableId, { ...alice, orgId: null }),
  ).rejects.toThrow();
  expect(await listTables(bob)).toEqual([]);
});
it("rejects a join to another owner before running it", async () => {
  const a = await saveImport({ columns: ["x"], rows: [{ x: 1 }] }, "a", alice, {
    sha256: "a",
    sample: true,
  });
  const b = await saveImport({ columns: ["x"], rows: [{ x: 1 }] }, "b", bob, {
    sha256: "b",
    sample: true,
  });
  await expect(
    runStep(
      "join",
      a.outputTableId,
      { rightTableId: b.outputTableId, keys: [{ left: "x", right: "x" }] },
      alice,
    ),
  ).rejects.toThrow(/not found/);
});
it("rolls back output when step-log write fails", async () => {
  const a = await saveImport({ columns: ["x"], rows: [{ x: 1 }] }, "a", alice, {
    sha256: "a",
    sample: true,
  });
  const before = await db.select({ n: count() }).from(schema.tables);
  await pg.exec(
    "ALTER TABLE rote_step_log ADD CONSTRAINT test_reject_sort CHECK (action <> 'sort')",
  );
  await expect(
    runStep("sort", a.outputTableId, { by: [{ column: "x" }] }, alice),
  ).rejects.toThrow();
  expect(await db.select({ n: count() }).from(schema.tables)).toEqual(before);
  await pg.exec("ALTER TABLE rote_step_log DROP CONSTRAINT test_reject_sort");
});
it("runs real sample reconciliation through persisted primitives, preserving input and trace linkage", async () => {
  const sample = payoutSample(1);
  const payouts = await parseFile(Buffer.from(sample.payouts), "p.csv"),
    bank = await parseFile(Buffer.from(sample.bank), "b.csv");
  const original = await saveImport(payouts, "sample payouts", alice, {
    sha256: "p",
    sample: true,
  });
  let left = original;
  let right = await saveImport(bank, "sample bank", alice, {
    sha256: "b",
    sample: true,
  });
  left = await runStep(
    "parse_number",
    left.outputTableId,
    { column: "net" },
    alice,
    "test-trace",
  );
  right = await runStep(
    "parse_number",
    right.outputTableId,
    { column: "amount", currency: "$" },
    alice,
    "test-trace",
  );
  const joined = await runStep(
    "join",
    left.outputTableId,
    {
      rightTableId: right.outputTableId,
      keys: [{ left: "payout_id", right: "reference" }],
      type: "inner",
    },
    alice,
    "test-trace",
  );
  const delta = await runStep(
    "compute_column",
    joined.outputTableId,
    { newColumn: "delta", formula: "[net] - [amount]" },
    alice,
    "test-trace",
  );
  const verified = await runStep(
    "validate",
    delta.outputTableId,
    {
      schema: { delta: "number" },
      nonNull: ["reference"],
      sumEquals: [{ column: "delta", value: 0 }],
      rowCount: { min: 25, max: 25 },
    },
    alice,
    "test-trace",
  );
  const result = await readTable(verified.outputTableId, alice);
  expect(result.rows.every((r) => r.delta === 0)).toBe(true);
  expect(
    compareTables(payouts, await readTable(original.outputTableId, alice)).pass,
  ).toBe(true);
  const logs = await db.select().from(schema.stepLog);
  expect(logs.filter((l) => l.traceRunId === "test-trace")).toHaveLength(5);
  expect(logs.every((l) => !JSON.stringify(l.params).includes("rows"))).toBe(
    true,
  );
});
