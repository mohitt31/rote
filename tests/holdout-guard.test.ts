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
import { assertReadable } from "../server/rote/holdout-guard.js";
import { prepareVendorSample } from "../server/rote/vendor-sample.js";
import { approveExample } from "../server/rote/workflow.js";

const scope = { ownerEmail: "guard@example.test", orgId: "team" };
beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema });
  for (const m of migrations) await pg.exec(m.sql);
}, 20000);
afterAll(async () => pg.close());

it("hides approved holdout references from agent callers only", async () => {
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
  const ref = f.holdout.outputTableId!;
  for (const caller of ["tool", "mcp", "a2a", "cli", "automation"] as const)
    await expect(
      assertReadable([ref], scope, { caller } as never),
    ).rejects.toThrow(/reserved for verification/);
  await expect(
    assertReadable([ref], scope, { caller: "frontend" } as never),
  ).resolves.toBeUndefined();
  // Training references and other tables stay readable to the agent.
  await expect(
    assertReadable([f.training.outputTableId!], scope, {
      caller: "tool",
    } as never),
  ).resolves.toBeUndefined();
  // Another workspace's holdout does not affect this caller.
  await expect(
    assertReadable([ref], { ...scope, orgId: "other" }, {
      caller: "tool",
    } as never),
  ).resolves.toBeUndefined();
});
