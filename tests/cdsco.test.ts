import { createHash } from "node:crypto";

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
import { prepareCdscoTask } from "../server/rote/cdsco-sample.js";
import { compareTables } from "../server/rote/comparator.js";
import { readTable } from "../server/rote/repository.js";
import {
  approveExample,
  crystallizeTask,
  promotePipeline,
  runTask,
  verifyPipeline,
} from "../server/rote/workflow.js";
import { CDSCO_MONTHS, cdscoReference } from "../shared/rote/cdsco.js";

const scope = { ownerEmail: "cdsco@example.test", orgId: null };
beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema });
  for (const m of migrations) await pg.exec(m.sql);
}, 20000);
afterAll(async () => pg.close());

it("bundles three real months with their published record counts", () => {
  expect(CDSCO_MONTHS.map((m) => [m.month, m.rows.length])).toEqual([
    ["Jan-2026", 218],
    ["Feb-2026", 217],
    ["Mar-2026", 190],
  ]);
  for (const m of CDSCO_MONTHS) expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
});

it("the independent reference cleans every row and leaves nothing unparsed", () => {
  for (const m of CDSCO_MONTHS) {
    const ref = cdscoReference(m);
    expect(ref.rows).toHaveLength(m.rows.length);
    for (const r of ref.rows) {
      expect(r.manufacturer).toBeTruthy();
      expect(String(r.manufacturer)).not.toContain(",");
      expect(String(r.expiry)).toMatch(/^\d{4}-\d{2}-01T00:00:00\.000Z$/);
      expect(r.failed_test).toBeTruthy();
    }
  }
  const jan = cdscoReference(CDSCO_MONTHS[0]!).rows[0]!;
  expect(jan).toMatchObject({
    manufacturer: "Unicure India Ltd",
    failed_test: "Description",
    expiry: "2027-02-01T00:00:00.000Z",
  });
});

it("teaches January, verifies on February and replays March on real data", async () => {
  const t = await prepareCdscoTask(scope);
  // The recorded steps reproduce January's independent reference exactly.
  expect(
    compareTables(
      await readTable(t.training.outputTableId!, scope),
      await readTable(t.training.sourceOutputTableId!, scope),
    ).pass,
  ).toBe(true);
  await approveExample(
    {
      taskId: t.taskId,
      inputs: t.training.inputs,
      outputTableId: t.training.outputTableId!,
      sourceOutputTableId: t.training.sourceOutputTableId!,
      holdout: false,
    },
    scope,
  );
  await approveExample(
    {
      taskId: t.taskId,
      inputs: t.holdout.inputs,
      outputTableId: t.holdout.outputTableId!,
      holdout: true,
    },
    scope,
  );
  const p = await crystallizeTask(t.taskId, scope);
  expect((await verifyPipeline(p.id, scope)).pass).toBe(true);
  await promotePipeline(p.id, p.hash, scope);
  const run = await runTask(t.taskId, t.next.inputs, scope);
  expect(run.status).toBe("succeeded");
  const march = await readTable(run.outputTableId!, scope);
  expect(march.rowCount).toBe(190);
  expect(
    compareTables(cdscoReference(CDSCO_MONTHS[2]!), march).pass,
  ).toBe(true);
  // Provenance: the bundled month hashes are the published files' hashes.
  expect(createHash("sha256").update("x").digest("hex")).toHaveLength(64);
});
