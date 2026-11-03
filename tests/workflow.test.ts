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
import { compareTables } from "../server/rote/comparator.js";
import { parseFile } from "../server/rote/io.js";
import { extractPlan, replay } from "../server/rote/pipeline-engine.js";
import { saveImport, runStep, readTable } from "../server/rote/repository.js";
import {
  createTask,
  approveExample,
  crystallizeTask,
  verifyPipeline,
  promotePipeline,
  runTask,
  getTask,
} from "../server/rote/workflow.js";
import { payoutSample } from "../shared/rote/samples.js";
const scope = { ownerEmail: "builder@example.test", orgId: "team" },
  other = { ownerEmail: "other@example.test", orgId: "team" };
beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema });
  for (const m of migrations) await pg.exec(m.sql);
}, 20000);
afterAll(async () => pg.close());
async function sample(week: number) {
  const data = payoutSample(week),
    p = await parseFile(Buffer.from(data.payouts), "p.csv"),
    b = await parseFile(Buffer.from(data.bank), "b.csv");
  const left = await saveImport(p, "payouts", scope, {
      sha256: `p${week}`,
      sample: true,
    }),
    right = await saveImport(b, "bank", scope, {
      sha256: `b${week}`,
      sample: true,
    });
  return {
    inputs: { payouts: left.outputTableId, bank: right.outputTableId },
    p,
    b,
  };
}
// A fake agent executes recorded tool calls; no model SDK or network is used in CI.
async function mockedAgent(inputs: { payouts: string; bank: string }) {
  const agent = vi.fn(async () => {
    const p = await runStep(
        "parse_number",
        inputs.payouts,
        { column: "net" },
        scope,
        "mock-agent-trace",
      ),
      b = await runStep(
        "parse_number",
        inputs.bank,
        { column: "amount", currency: "$" },
        scope,
        "mock-agent-trace",
      );
    let t = await runStep(
      "join",
      p.outputTableId,
      {
        rightTableId: b.outputTableId,
        keys: [{ left: "payout_id", right: "reference" }],
        type: "left",
      },
      scope,
      "mock-agent-trace",
    );
    t = await runStep(
      "compute_column",
      t.outputTableId,
      { newColumn: "delta", formula: "[net] - [amount]" },
      scope,
      "mock-agent-trace",
    );
    t = await runStep(
      "compute_column",
      t.outputTableId,
      { newColumn: "delta_squared", formula: "[delta] * [delta]" },
      scope,
      "mock-agent-trace",
    );
    t = await runStep(
      "validate",
      t.outputTableId,
      {
        nonNull: ["payout_id", "amount"],
        unique: [["payout_id"]],
        sumEquals: [{ column: "delta_squared", value: 0 }],
        rowCount: { min: 1, max: 100000 },
      },
      scope,
      "mock-agent-trace",
    );
    return runStep(
      "select_columns",
      t.outputTableId,
      { columns: ["payout_id", "net", "amount", "delta"] },
      scope,
      "mock-agent-trace",
    );
  });
  const result = await agent();
  expect(agent).toHaveBeenCalledTimes(1);
  return result.outputTableId;
}
async function reference(p: Awaited<ReturnType<typeof sample>>) {
  return saveImport(
    {
      columns: ["payout_id", "net", "amount", "delta"],
      rows: p.p.rows.map((r) => ({
        payout_id: r.payout_id!,
        net: Number(r.net),
        amount: Number(r.net),
        delta: 0,
      })),
    },
    "independent sample reference",
    scope,
    { sha256: `reference-${p.inputs.payouts}`, sample: true },
  );
}
async function prepared(bad = false) {
  const task = await createTask("Payouts", "Test task", {}, scope),
    a = await sample(1),
    b = await sample(2),
    source = await mockedAgent(a.inputs),
    gold = await reference(a),
    hold = await reference(b);
  await approveExample(
    {
      taskId: task.id,
      inputs: a.inputs,
      sourceOutputTableId: source,
      outputTableId: gold.outputTableId,
      holdout: false,
    },
    scope,
  );
  const out = bad
    ? await saveImport(
        { columns: ["wrong"], rows: [{ wrong: 1 }] },
        "bad reference",
        scope,
        { sha256: "bad-ref", sample: true },
      )
    : hold;
  await approveExample(
    {
      taskId: task.id,
      inputs: b.inputs,
      outputTableId: out.outputTableId,
      holdout: true,
    },
    scope,
  );
  return { task, a, b, candidate: await crystallizeTask(task.id, scope) };
}
it("runs mocked-agent → approved examples → extract → verify → exact-hash promote → next-week replay", async () => {
  const { task, candidate } = await prepared();
  await expect(
    runTask(task.id, (await sample(3)).inputs, scope),
  ).rejects.toThrow(/Promote/);
  const check = await verifyPipeline(candidate.id, scope);
  expect(check.pass).toBe(true);
  await expect(
    promotePipeline(candidate.id, "0".repeat(64), scope),
  ).rejects.toThrow(/hash/);
  await promotePipeline(candidate.id, candidate.hash, scope);
  const next = await sample(3),
    out = await runTask(task.id, next.inputs, scope),
    expected = await reference(next);
  expect(out.status).toBe("succeeded");
  expect(out.tokensIn + out.tokensOut).toBe(0);
  expect(
    compareTables(
      await readTable(expected.outputTableId, scope),
      await readTable(out.outputTableId!, scope),
    ).pass,
  ).toBe(true);
  const detail = await getTask(task.id, scope);
  expect(detail.runs.find((r) => r.mode === "manual")?.tokensIn).toBeNull();
  expect(detail.versions[0]?.status).toBe("approved");
});
it("blocks failed holdout and unverified promotion", async () => {
  const { candidate } = await prepared(true);
  await expect(
    promotePipeline(candidate.id, candidate.hash, scope),
  ).rejects.toThrow();
  expect((await verifyPipeline(candidate.id, scope)).pass).toBe(false);
  await expect(
    promotePipeline(candidate.id, candidate.hash, scope),
  ).rejects.toThrow();
});
it("freezes reference data and blocks cross-tenant access", async () => {
  const { task, a, candidate } = await prepared();
  await expect(
    approveExample(
      {
        taskId: task.id,
        inputs: a.inputs,
        outputTableId: a.inputs.payouts,
        holdout: true,
      },
      scope,
    ),
  ).rejects.toThrow(/frozen/);
  await expect(getTask(task.id, other)).rejects.toThrow(/not found/);
  await expect(
    verifyPipeline(candidate.id, { ...scope, orgId: "other" }),
  ).rejects.toThrow(/not found/);
});
it("requires an independent holdout and rejects duplicate files", async () => {
  const task = await createTask("one", "", {}, scope),
    a = await sample(1),
    source = await mockedAgent(a.inputs);
  await approveExample(
    {
      taskId: task.id,
      inputs: a.inputs,
      outputTableId: source,
      sourceOutputTableId: source,
      holdout: false,
    },
    scope,
  );
  await expect(
    approveExample(
      {
        taskId: task.id,
        inputs: a.inputs,
        outputTableId: a.inputs.bank,
        holdout: true,
      },
      scope,
    ),
  ).rejects.toThrow(/independent/);
  await expect(crystallizeTask(task.id, scope)).rejects.toThrow(/holdout/);
});
it("detects schema drift and persists a zero-token drift run without output", async () => {
  const { task, candidate } = await prepared();
  await verifyPipeline(candidate.id, scope);
  await promotePipeline(candidate.id, candidate.hash, scope);
  const x = await sample(3),
    bad = await saveImport(
      { columns: ["changed"], rows: [{ changed: "1" }] },
      "changed",
      scope,
      { sha256: "drift", sample: true },
    );
  const r = await runTask(
    task.id,
    { ...x.inputs, payouts: bad.outputTableId },
    scope,
  );
  expect(r.status).toBe("drift");
  expect(r.outputTableId).toBeNull();
  expect((await getTask(task.id, scope)).runs[0]?.status).toBe("drift");
});
it("extraction never reads unreferenced holdout tables and rejects missing lineage", async () => {
  const read = vi.fn(async (id: string) => {
    if (id !== "input") throw Error("holdout accessed");
    return { columns: ["x"], rows: [{ x: "1" }] };
  });
  const plan = await extractPlan({ input: "input" }, "out", read, async () => ({
    action: "parse_number",
    inputTableId: "input",
    outputTableId: "out",
    params: { column: "x" },
  }));
  expect(read).toHaveBeenCalledTimes(1);
  expect(
    replay(plan, { input: { columns: ["x"], rows: [{ x: "2" }] } }).rows,
  ).toEqual([{ x: 2 }]);
  await expect(
    extractPlan({ input: "input" }, "missing", read, async () => undefined),
  ).rejects.toThrow(/lineage/);
});
it("stops replay when same-schema amounts violate recorded validation", async () => {
  const { task, candidate } = await prepared();
  await verifyPipeline(candidate.id, scope);
  await promotePipeline(candidate.id, candidate.hash, scope);
  const next = await sample(3);
  next.b.rows[0]!.amount = "$99999.00";
  const changed = await saveImport(next.b, "changed amounts", scope, {
    sha256: "changed-amounts",
    sample: true,
  });
  const result = await runTask(
    task.id,
    { ...next.inputs, bank: changed.outputTableId },
    scope,
  );
  expect(result.status).toBe("drift");
  expect(result.outputTableId).toBeNull();
  expect(result.message).toMatch(/validation failed/);
});

it("reconciles batched settlements, refunds and delayed/reordered bank rows on an unseen week", async () => {
  const { prepareBatchedSample } =
    await import("../server/rote/batched-sample.js");
  const fixture = await prepareBatchedSample(scope);
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
  const p = await crystallizeTask(fixture.taskId, scope);
  expect((await verifyPipeline(p.id, scope)).pass).toBe(true);
  await promotePipeline(p.id, p.hash, scope);
  const out = await runTask(fixture.taskId, fixture.next.inputs, scope);
  expect(out.status).toBe("succeeded");
  const { batchedPayoutSample } = await import("../shared/rote/samples.js");
  expect(
    compareTables(
      batchedPayoutSample(3).expected,
      await readTable(out.outputTableId!, scope),
    ).pass,
  ).toBe(true);
  const bank = await readTable(fixture.next.inputs.bank, scope);
  bank.rows[0]!.booking_date = "01/01/2025";
  const late = await saveImport(bank, "out-of-window", scope, {
    sha256: "bad-window",
    sample: true,
  });
  expect(
    (
      await runTask(
        fixture.taskId,
        { ...fixture.next.inputs, bank: late.outputTableId },
        scope,
      )
    ).status,
  ).toBe("drift");
});
it("generalizes an existing scalar without modifying frozen examples or approved versions", async () => {
  const { parameterizePipeline } = await import("../server/rote/workflow.js");
  const task = await createTask("Currency parsing", "", {}, scope);
  const training = await saveImport(
      { columns: ["amount"], rows: [{ amount: "$12.50" }] },
      "dollars",
      scope,
      { sha256: "dollars", sample: true },
    ),
    hold = await saveImport(
      { columns: ["amount"], rows: [{ amount: "€25.00" }] },
      "euros",
      scope,
      { sha256: "euros", sample: true },
    );
  const source = await runStep(
    "parse_number",
    training.outputTableId,
    { column: "amount", currency: "$" },
    scope,
  );
  const reference = await saveImport(
    { columns: ["amount"], rows: [{ amount: 25 }] },
    "euro reference",
    scope,
    { sha256: "euro-reference", sample: true },
  );
  await approveExample(
    {
      taskId: task.id,
      inputs: { input: training.outputTableId },
      outputTableId: source.outputTableId,
      sourceOutputTableId: source.outputTableId,
      holdout: false,
      parameterValues: { currency: "$" },
    },
    scope,
  );
  await approveExample(
    {
      taskId: task.id,
      inputs: { input: hold.outputTableId },
      outputTableId: reference.outputTableId,
      holdout: true,
      parameterValues: { currency: "€" },
    },
    scope,
  );
  const original = await crystallizeTask(task.id, scope);
  expect((await verifyPipeline(original.id, scope)).pass).toBe(false);
  const edited = await parameterizePipeline(
    original.id,
    [{ step: 0, path: ["currency"], name: "currency" }],
    scope,
  );
  expect(edited.version).toBe(2);
  expect(edited.hash).not.toBe(original.hash);
  expect((await verifyPipeline(edited.id, scope)).pass).toBe(true);
  await promotePipeline(edited.id, edited.hash, scope);
  expect(
    (
      await runTask(task.id, { input: hold.outputTableId }, scope, {
        currency: "€",
      })
    ).status,
  ).toBe("succeeded");
  expect(
    (
      await runTask(task.id, { input: hold.outputTableId }, scope, {
        currency: 2,
      })
    ).status,
  ).toBe("drift");
  await expect(
    parameterizePipeline(
      edited.id,
      [{ step: 0, path: ["constructor"], name: "bad" }],
      scope,
    ),
  ).rejects.toThrow();
});

it("cleans an unseen vendor price list after teaching one week", async () => {
  const { prepareVendorSample } =
    await import("../server/rote/vendor-sample.js");
  const { vendorCleanupSample } = await import("../shared/rote/samples.js");
  const fixture = await prepareVendorSample(scope);
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
  const p = await crystallizeTask(fixture.taskId, scope);
  expect((await verifyPipeline(p.id, scope)).pass).toBe(true);
  await promotePipeline(p.id, p.hash, scope);
  const out = await runTask(fixture.taskId, fixture.next.inputs, scope);
  expect(out.status).toBe("succeeded");
  expect(
    compareTables(
      vendorCleanupSample(3).expected,
      await readTable(out.outputTableId!, scope),
    ).pass,
  ).toBe(true);
  // Conflicting prices for one SKU must stop instead of keeping one silently.
  const conflict = await readTable(fixture.next.inputs.prices, scope);
  conflict.rows.push({ ...conflict.rows[1]!, "Unit Price": "$1.00" });
  const dup = await saveImport(conflict, "conflict", scope, {
    sha256: "vendor-conflict",
    sample: true,
  });
  expect(
    (await runTask(fixture.taskId, { prices: dup.outputTableId }, scope))
      .status,
  ).toBe("drift");
  // A new unit code is unknown to the approved mapping: stop, never guess.
  const week = await readTable(fixture.next.inputs.prices, scope);
  week.rows[0]!.UOM = "dozen";
  const changed = await saveImport(week, "new-unit", scope, {
    sha256: "vendor-new-unit",
    sample: true,
  });
  expect(
    (await runTask(fixture.taskId, { prices: changed.outputTableId }, scope))
      .status,
  ).toBe("drift");
});

it("re-teaches a changed bank format as v2 without unfreezing v1 references", async () => {
  const { prepareBatchedSample, prepareBankFormatChange } =
    await import("../server/rote/batched-sample.js");
  const { batchedPayoutSample } = await import("../shared/rote/samples.js");
  const v1 = await prepareBatchedSample(scope);
  const approve = (
    e: (typeof v1)["training"],
    holdout: boolean,
    retrain = false,
  ) =>
    approveExample(
      {
        taskId: v1.taskId,
        inputs: e.inputs,
        outputTableId: e.outputTableId!,
        ...(holdout ? {} : { sourceOutputTableId: e.sourceOutputTableId! }),
        holdout,
        retrain,
      },
      scope,
    );
  await approve(v1.training, false);
  await approve(v1.holdout, true);
  const p1 = await crystallizeTask(v1.taskId, scope);
  expect((await verifyPipeline(p1.id, scope)).pass).toBe(true);
  await promotePipeline(p1.id, p1.hash, scope);

  const v2 = await prepareBankFormatChange(v1.taskId, scope);
  // The new format drifts under v1 and writes nothing.
  expect((await runTask(v1.taskId, v2.next.inputs, scope)).status).toBe(
    "drift",
  );
  // Frozen without an explicit new generation; holdout cannot start one.
  await expect(approve(v2.training, false)).rejects.toThrow(/frozen/);
  await expect(approve(v2.holdout, true, true)).rejects.toThrow(/generation/);
  expect((await approve(v2.training, false, true)).generation).toBe(2);
  expect((await approve(v2.holdout, true)).generation).toBe(2);

  const p2 = await crystallizeTask(v1.taskId, scope);
  expect(p2.version).toBe(2);
  // v2 verifies only against generation-2 references.
  const check = await verifyPipeline(p2.id, scope);
  expect(check.pass).toBe(true);
  // v1 stays active and keeps serving old-format weeks until v2 is approved.
  expect((await getTask(v1.taskId, scope)).task.currentPipelineId).toBe(p1.id);
  await promotePipeline(p2.id, p2.hash, scope);
  const out = await runTask(v1.taskId, v2.next.inputs, scope);
  expect(out.status).toBe("succeeded");
  expect(
    compareTables(
      batchedPayoutSample(6).expected,
      await readTable(out.outputTableId!, scope),
    ).pass,
  ).toBe(true);
  const detail = await getTask(v1.taskId, scope);
  expect(detail.generation).toBe(2);
  expect(detail.versions.map((v) => [v.version, v.generation])).toEqual([
    [2, 2],
    [1, 1],
  ]);
});
