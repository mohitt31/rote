import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

import { migrations } from "../server/db/migrations.js";
import * as schema from "../server/db/schema.js";
let pg: PGlite, db: ReturnType<typeof drizzle<typeof schema>>;
vi.mock("../server/rote/trace-evidence.js", () => ({
  traceEvidence: vi.fn(async () => null),
}));
vi.mock("../server/db/index.js", () => ({ getDb: () => db, schema }));
import { maybeResetDemo, demoStatus } from "../server/rote/demo.js";
import { prepareVendorSample } from "../server/rote/vendor-sample.js";
import {
  approveExample,
  crystallizeTask,
  listTasks,
  promotePipeline,
  runTask,
  verifyPipeline,
} from "../server/rote/workflow.js";

const demo = { ownerEmail: "demo@example.test", orgId: null },
  other = { ownerEmail: "keep@example.test", orgId: null };
beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema });
  for (const m of migrations) await pg.exec(m.sql);
}, 20000);
afterAll(async () => pg.close());
afterEach(() => {
  delete process.env.ROTE_PUBLIC_DEMO; // guard:allow-env-credential — test toggles the demo flag
});

async function fullLoop(scope: typeof demo) {
  const f = await prepareVendorSample(scope);
  await approveExample(
    {
      taskId: f.taskId,
      inputs: f.training.inputs,
      outputTableId: f.training.outputTableId!,
      sourceOutputTableId: f.training.sourceOutputTableId!,
      holdout: false,
    },
    scope,
  );
  await approveExample(
    {
      taskId: f.taskId,
      inputs: f.holdout.inputs,
      outputTableId: f.holdout.outputTableId!,
      holdout: true,
    },
    scope,
  );
  const p = await crystallizeTask(f.taskId, scope);
  await verifyPipeline(p.id, scope);
  await promotePipeline(p.id, p.hash, scope);
  await runTask(f.taskId, f.next.inputs, scope);
}

it("does nothing outside public demo mode", async () => {
  expect(await maybeResetDemo(demo)).toBe(false);
  expect((await demoStatus(demo)).publicDemo).toBe(false);
});

it("wipes only the demo workspace once the hourly window has passed", async () => {
  process.env.ROTE_PUBLIC_DEMO = "true"; // guard:allow-env-credential — test toggles the demo flag
  await fullLoop(demo);
  await fullLoop(other);
  const t0 = Date.parse("2026-11-01T10:00:00Z");
  expect(await maybeResetDemo(demo, t0)).toBe(false); // first visit starts the clock
  expect(await maybeResetDemo(demo, t0 + 30 * 60_000)).toBe(false);
  expect((await listTasks(demo)).length).toBe(1);
  expect(await maybeResetDemo(demo, t0 + 61 * 60_000)).toBe(true);
  expect(await listTasks(demo)).toEqual([]);
  const left = await pg.query<{ n: number }>(
    "select count(*)::int as n from rote_tables where owner_email = $1",
    [demo.ownerEmail],
  );
  expect(left.rows[0]!.n).toBe(0);
  // Another owner's data is untouched.
  expect((await listTasks(other)).length).toBe(1);
  const status = await demoStatus(demo, t0 + 62 * 60_000);
  expect(status.publicDemo).toBe(true);
  expect(Date.parse(status.nextResetAt!)).toBe(t0 + 121 * 60_000);
});
