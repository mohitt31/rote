import { randomUUID } from "node:crypto";

import { and, eq, isNull, desc } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import type { Table } from "../../shared/rote/model.js";
import {
  planSchema,
  parameterValuesSchema,
  bindingsSchema,
  toleranceSchema,
} from "../../shared/rote/pipeline.js";
import { getDb, schema as s } from "../db/index.js";
import { compareTables, validateComparator } from "./comparator.js";
import {
  extractPlan,
  replay,
  planHash,
  parameterizePlan,
} from "./pipeline-engine.js";
import {
  readTable,
  tableRecord,
  requireScope,
  RoteError,
  type Scope,
} from "./repository.js";
import { traceEvidence } from "./trace-evidence.js";
export const scoped = (
  t: { ownerEmail: AnyPgColumn; orgId: AnyPgColumn },
  scope: Scope,
) =>
  and(
    eq(t.ownerEmail, requireScope(scope).ownerEmail),
    scope.orgId === null ? isNull(t.orgId) : eq(t.orgId, scope.orgId),
  );
export async function taskById(id: string, scope: Scope) {
  const [t] = await getDb()
    .select()
    .from(s.tasks)
    .where(and(eq(s.tasks.id, id), scoped(s.tasks, scope)))
    .limit(1);
  if (!t) throw new RoteError("Task not found");
  return t;
}
async function pipelineById(id: string, scope: Scope) {
  const [p] = await getDb()
    .select()
    .from(s.pipelines)
    .where(and(eq(s.pipelines.id, id), scoped(s.pipelines, scope)))
    .limit(1);
  if (!p) throw new RoteError("Pipeline not found");
  return p;
}
async function currentGeneration(taskId: string, scope: Scope) {
  const rows = await getDb()
    .select({ generation: s.goldenExamples.generation })
    .from(s.goldenExamples)
    .where(
      and(eq(s.goldenExamples.taskId, taskId), scoped(s.goldenExamples, scope)),
    );
  return Math.max(1, ...rows.map((r) => r.generation));
}
async function exampleRows(taskId: string, scope: Scope) {
  return getDb()
    .select()
    .from(s.goldenExamples)
    .where(
      and(eq(s.goldenExamples.taskId, taskId), scoped(s.goldenExamples, scope)),
    )
    .orderBy(s.goldenExamples.id);
}
export async function createTask(
  name: string,
  description: string,
  tolerances: Record<string, number>,
  scope: Scope,
) {
  const id = randomUUID();
  await getDb()
    .insert(s.tasks)
    .values({
      id,
      name,
      description,
      tolerances: toleranceSchema.parse(tolerances),
      ...requireScope(scope),
    });
  return { id };
}
async function loadInputs(bindings: Record<string, string>, scope: Scope) {
  const values: Record<string, Awaited<ReturnType<typeof readTable>>> = {};
  for (const [name, id] of Object.entries(bindingsSchema.parse(bindings)))
    values[name] = await readTable(id, scope);
  return values;
}
export async function approveExample(
  args: {
    taskId: string;
    inputs: Record<string, string>;
    outputTableId: string;
    sourceOutputTableId?: string | undefined;
    holdout: boolean;
    parameterValues?: Record<string, string | number | boolean> | undefined;
    /** Start a new example generation after the current one was crystallized. */
    retrain?: boolean | undefined;
  },
  scope: Scope,
) {
  await taskById(args.taskId, scope);
  const inputs = await loadInputs(args.inputs, scope);
  await readTable(args.outputTableId, scope);
  for (const t of Object.values(inputs))
    if (!t.fileId)
      throw new RoteError("Example inputs must be original imported tables");
  if (!args.holdout && !args.sourceOutputTableId)
    throw new RoteError("Training example requires a recorded source output");
  if (args.sourceOutputTableId)
    await readTable(args.sourceOutputTableId, scope);
  const id = randomUUID();
  let generation = 1;
  await getDb().transaction(async (tx) => {
    await tx
      .select()
      .from(s.tasks)
      .where(and(eq(s.tasks.id, args.taskId), scoped(s.tasks, scope)))
      .for("update");
    const all = await tx
      .select()
      .from(s.goldenExamples)
      .where(
        and(
          eq(s.goldenExamples.taskId, args.taskId),
          scoped(s.goldenExamples, scope),
        ),
      );
    const current = Math.max(1, ...all.map((e) => e.generation));
    const frozen = await tx
      .select({ id: s.pipelines.id })
      .from(s.pipelines)
      .where(
        and(
          eq(s.pipelines.taskId, args.taskId),
          eq(s.pipelines.generation, current),
          scoped(s.pipelines, scope),
        ),
      )
      .limit(1);
    if (frozen.length && !args.retrain)
      throw new RoteError(
        "Examples are frozen after crystallization; start a new generation to teach a changed input format",
      );
    if (frozen.length && args.holdout)
      throw new RoteError(
        "Start a new generation with a training example, then add its holdout",
      );
    generation = frozen.length ? current + 1 : current;
    // Binding names must match within a generation; independence holds across all.
    const existing = all.filter((e) => e.generation === generation);
    if (all.length >= 20) throw new RoteError("At most 20 examples per task");
    const fileIds = Object.values(inputs).map((t) => t.fileId!);
    const files = await tx.select().from(s.files).where(scoped(s.files, scope));
    const hashes = new Map(files.map((f) => [f.id, f.sha256]));
    for (const e of existing)
      if (
        Object.keys(e.inputBindings).sort().join("|") !==
        Object.keys(args.inputs).sort().join("|")
      )
        throw new RoteError("All examples need the same input names");
    for (const e of all) {
      if (
        e.outputTableId === args.outputTableId ||
        e.inputFileIds.some((f) =>
          fileIds.some((n) => n === f || hashes.get(n) === hashes.get(f)),
        )
      )
        throw new RoteError(
          "Examples must use independent input files and outputs",
        );
    }
    await tx.insert(s.goldenExamples).values({
      id,
      taskId: args.taskId,
      inputBindings: args.inputs,
      parameterValues: parameterValuesSchema.parse(args.parameterValues ?? {}),
      inputFileIds: fileIds,
      outputTableId: args.outputTableId,
      sourceOutputTableId: args.sourceOutputTableId,
      holdout: args.holdout,
      generation,
      ...scope,
    });
  });
  return { id, generation };
}
export async function crystallizeTask(taskId: string, scope: Scope) {
  await taskById(taskId, scope);
  const generation = await currentGeneration(taskId, scope);
  // Only training rows are fetched here. Holdout inputs/outputs never enter extraction.
  const [gold] = await getDb()
    .select()
    .from(s.goldenExamples)
    .where(
      and(
        eq(s.goldenExamples.taskId, taskId),
        eq(s.goldenExamples.holdout, false),
        eq(s.goldenExamples.generation, generation),
        scoped(s.goldenExamples, scope),
      ),
    )
    .orderBy(s.goldenExamples.createdAt)
    .limit(1);
  if (!gold?.sourceOutputTableId)
    throw new RoteError(
      "Approve a training example with recorded lineage first",
    );
  const traceIds: (string | null)[] = [];
  const plan = await extractPlan(
    gold.inputBindings,
    gold.sourceOutputTableId,
    (id) => readTable(id, scope),
    async (id) => {
      const [log] = await getDb()
        .select()
        .from(s.stepLog)
        .where(and(eq(s.stepLog.outputTableId, id), scoped(s.stepLog, scope)))
        .limit(1);
      if (log) traceIds.push(log.traceRunId);
      return log;
    },
  );
  const evidence = await traceEvidence(traceIds, scope);
  const id = randomUUID(),
    runId = randomUUID();
  let version = 1;
  await getDb().transaction(async (tx) => {
    await tx
      .select()
      .from(s.tasks)
      .where(and(eq(s.tasks.id, taskId), scoped(s.tasks, scope)))
      .for("update");
    const [holdout] = await tx
      .select({ id: s.goldenExamples.id })
      .from(s.goldenExamples)
      .where(
        and(
          eq(s.goldenExamples.taskId, taskId),
          eq(s.goldenExamples.holdout, true),
          eq(s.goldenExamples.generation, generation),
          scoped(s.goldenExamples, scope),
        ),
      )
      .limit(1);
    if (!holdout)
      throw new RoteError(
        "Approve an independent holdout before freezing examples",
      );
    const [last] = await tx
      .select()
      .from(s.pipelines)
      .where(and(eq(s.pipelines.taskId, taskId), scoped(s.pipelines, scope)))
      .orderBy(desc(s.pipelines.version))
      .limit(1);
    version = (last?.version ?? 0) + 1;
    await tx.insert(s.runs).values({
      id: runId,
      taskId,
      mode: evidence ? "agent" : "manual",
      status: "succeeded",
      outputTableId: gold.sourceOutputTableId,
      approvedBy: scope.ownerEmail,
      ...(evidence ?? {}),
      ...scope,
    });
    await tx.insert(s.pipelines).values({
      id,
      taskId,
      version,
      steps: plan,
      paramsSchema: { inputNames: plan.inputs, hash: planHash(plan) },
      status: "candidate",
      generation,
      createdFromRunId: runId,
      ...scope,
    });
  });
  return { id, version, hash: planHash(plan), stepCount: plan.steps.length };
}
export async function verifyPipeline(id: string, scope: Scope) {
  const p = await pipelineById(id, scope),
    task = await taskById(p.taskId, scope);
  if (p.status !== "candidate" && p.status !== "verified")
    throw new RoteError("Only candidate or verified pipelines can be checked");
  const examples = (await exampleRows(task.id, scope)).filter(
    (e) => e.generation === p.generation,
  );
  if (!examples.some((e) => e.holdout) || !examples.some((e) => !e.holdout))
    throw new RoteError(
      "A training example and an independent holdout are required",
    );
  const plan = planSchema.parse(p.steps),
    results: { exampleId: string; holdout: boolean; pass: boolean }[] = [],
    checks: ({ exampleId: string } & ReturnType<typeof validateComparator>)[] =
      [],
    diffs: unknown[] = [];
  for (const e of examples) {
    const golden = await readTable(e.outputTableId, scope);
    let check;
    try {
      check = validateComparator(golden, task.tolerances);
    } catch {
      check = {
        pass: false,
        identical: false,
        changedRejected: false,
        droppedRejected: false,
      };
    }
    checks.push({ exampleId: e.id, ...check });
    try {
      if (!check.pass) throw Error("Comparator self-check failed");
      const output = replay(
        plan,
        await loadInputs(e.inputBindings, scope),
        e.parameterValues,
      );
      const comparison = compareTables(golden, output, task.tolerances);
      results.push({
        exampleId: e.id,
        holdout: e.holdout,
        pass: comparison.pass,
      });
      diffs.push({ exampleId: e.id, holdout: e.holdout, ...comparison });
    } catch (e2) {
      results.push({ exampleId: e.id, holdout: e.holdout, pass: false });
      diffs.push({
        exampleId: e.id,
        holdout: e.holdout,
        error: e2 instanceof Error ? e2.message : "Verification failed",
      });
    }
  }
  const pass = checks.every((c) => c.pass) && results.every((r) => r.pass),
    verificationId = randomUUID(),
    hash = planHash(plan);
  await getDb().transaction(async (tx) => {
    await tx
      .select()
      .from(s.tasks)
      .where(and(eq(s.tasks.id, task.id), scoped(s.tasks, scope)))
      .for("update");
    const [current] = await tx
      .select()
      .from(s.pipelines)
      .where(and(eq(s.pipelines.id, id), scoped(s.pipelines, scope)));
    if (!current || !["candidate", "verified"].includes(current.status))
      throw new RoteError("Pipeline changed during verification");
    await tx.insert(s.verifications).values({
      id: verificationId,
      pipelineId: id,
      checkValidationResult: {
        pass: checks.every((c) => c.pass),
        checks,
        hash,
        exampleIds: examples.map((e) => e.id),
      },
      exampleResults: results,
      rowDiff: diffs,
      attempts: [],
      ...scope,
    });
    await tx
      .update(s.pipelines)
      .set({ status: pass ? "verified" : "candidate" })
      .where(and(eq(s.pipelines.id, id), scoped(s.pipelines, scope)));
  });
  return {
    id: verificationId,
    pipelineId: id,
    hash,
    pass,
    exampleCount: results.length,
  };
}
export async function promotePipeline(id: string, hash: string, scope: Scope) {
  const p = await pipelineById(id, scope);
  await taskById(p.taskId, scope);
  await getDb().transaction(async (tx) => {
    await tx
      .select()
      .from(s.tasks)
      .where(and(eq(s.tasks.id, p.taskId), scoped(s.tasks, scope)))
      .for("update");
    const [current] = await tx
      .select()
      .from(s.pipelines)
      .where(and(eq(s.pipelines.id, id), scoped(s.pipelines, scope)));
    if (
      !current ||
      current.status !== "verified" ||
      planHash(planSchema.parse(current.steps)) !== hash
    )
      throw new RoteError("Approval must match the verified pipeline hash");
    const [v] = await tx
      .select()
      .from(s.verifications)
      .where(
        and(eq(s.verifications.pipelineId, id), scoped(s.verifications, scope)),
      )
      .orderBy(desc(s.verifications.createdAt))
      .limit(1);
    const check = v?.checkValidationResult as
        | { pass?: boolean; hash?: string }
        | undefined,
      results = v?.exampleResults as
        | { pass: boolean; holdout: boolean }[]
        | undefined;
    if (
      !check?.pass ||
      check.hash !== hash ||
      !results?.length ||
      !results.every((r) => r.pass) ||
      !results.some((r) => r.holdout)
    )
      throw new RoteError("Successful verification evidence required");
    await tx
      .update(s.pipelines)
      .set({ status: "retired" })
      .where(
        and(
          eq(s.pipelines.taskId, p.taskId),
          eq(s.pipelines.status, "approved"),
          scoped(s.pipelines, scope),
        ),
      );
    await tx
      .update(s.pipelines)
      .set({ status: "approved" })
      .where(and(eq(s.pipelines.id, id), scoped(s.pipelines, scope)));
    await tx
      .update(s.tasks)
      .set({ currentPipelineId: id })
      .where(and(eq(s.tasks.id, p.taskId), scoped(s.tasks, scope)));
  });
  return { id, status: "approved" as const };
}
export async function runTask(
  taskId: string,
  bindings: Record<string, string>,
  scope: Scope,
  parameterValues: Record<string, string | number | boolean> = {},
) {
  const start = performance.now(),
    task = await taskById(taskId, scope);
  if (!task.currentPipelineId)
    throw new RoteError("Promote a verified pipeline first");
  const p = await pipelineById(task.currentPipelineId, scope);
  if (p.status !== "approved")
    throw new RoteError("Active pipeline is not approved");
  const inputs = await loadInputs(bindings, scope),
    id = randomUUID();
  let output: Table;
  try {
    output = replay(p.steps, inputs, parameterValues);
  } catch (e) {
    const durationMs = performance.now() - start;
    await getDb()
      .insert(s.runs)
      .values({
        id,
        taskId,
        pipelineId: p.id,
        mode: "pipeline",
        status: "drift",
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        durationMs,
        inputFingerprint: JSON.stringify(
          Object.fromEntries(
            Object.entries(inputs).map(([n, t]) => [n, t.fingerprint]),
          ),
        ),
        ...scope,
      });
    return {
      id,
      status: "drift" as const,
      outputTableId: null,
      durationMs,
      tokensIn: 0 as const,
      tokensOut: 0 as const,
      message:
        e instanceof Error ? e.message : "Replay failed; agent review required",
    };
  }
  const record = tableRecord(
    output,
    `${task.name} · v${p.version}`,
    scope,
    Object.values(inputs).some((t) => t.sample),
  );
  await getDb().transaction(async (tx) => {
    await tx.insert(s.tables).values(record);
    await tx.insert(s.runs).values({
      id,
      taskId,
      pipelineId: p.id,
      mode: "pipeline",
      status: "succeeded",
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      durationMs: performance.now() - start,
      outputTableId: record.id,
      inputFingerprint: JSON.stringify(
        Object.fromEntries(
          Object.entries(inputs).map(([n, t]) => [n, t.fingerprint]),
        ),
      ),
      ...scope,
    });
  });
  const durationMs = performance.now() - start;
  await getDb()
    .update(s.runs)
    .set({ durationMs })
    .where(and(eq(s.runs.id, id), scoped(s.runs, scope)));
  return {
    id,
    status: "succeeded" as const,
    outputTableId: record.id,
    durationMs,
    tokensIn: 0 as const,
    tokensOut: 0 as const,
    message: "Deterministic replay completed without model calls",
  };
}
export async function listTasks(scope: Scope) {
  return getDb()
    .select()
    .from(s.tasks)
    .where(scoped(s.tasks, scope))
    .orderBy(desc(s.tasks.createdAt))
    .limit(100);
}
export async function getTask(id: string, scope: Scope) {
  const task = await taskById(id, scope),
    examples = await exampleRows(id, scope),
    pipelines = await getDb()
      .select()
      .from(s.pipelines)
      .where(and(eq(s.pipelines.taskId, id), scoped(s.pipelines, scope)))
      .orderBy(desc(s.pipelines.version))
      .limit(20),
    runs = await getDb()
      .select()
      .from(s.runs)
      .where(and(eq(s.runs.taskId, id), scoped(s.runs, scope)))
      .orderBy(desc(s.runs.createdAt))
      .limit(20);
  const versions = [];
  for (const p of pipelines) {
    const [v] = await getDb()
      .select()
      .from(s.verifications)
      .where(
        and(
          eq(s.verifications.pipelineId, p.id),
          scoped(s.verifications, scope),
        ),
      )
      .orderBy(desc(s.verifications.createdAt))
      .limit(1);
    versions.push({
      id: p.id,
      version: p.version,
      status: p.status,
      generation: p.generation,
      hash: planHash(planSchema.parse(p.steps)),
      plan: planSchema.parse(p.steps),
      verification: v
        ? {
            id: v.id,
            check: v.checkValidationResult,
            results: v.exampleResults,
          }
        : null,
    });
  }
  return {
    task,
    examples: examples.map((e) => ({
      id: e.id,
      holdout: e.holdout,
      inputNames: Object.keys(e.inputBindings).sort(),
      generation: e.generation,
    })),
    generation: Math.max(1, ...examples.map((e) => e.generation)),
    versions,
    runs,
  };
}

export async function parameterizePipeline(
  id: string,
  edits: { step: number; path: (string | number)[]; name: string }[],
  scope: Scope,
) {
  const source = await pipelineById(id, scope);
  let plan;
  try {
    plan = parameterizePlan(source.steps, edits);
  } catch (e) {
    throw new RoteError(
      e instanceof Error ? e.message : "Invalid parameter mapping",
    );
  }
  const newId = randomUUID();
  let version = 0;
  await getDb().transaction(async (tx) => {
    await tx
      .select()
      .from(s.tasks)
      .where(and(eq(s.tasks.id, source.taskId), scoped(s.tasks, scope)))
      .for("update");
    const [last] = await tx
      .select()
      .from(s.pipelines)
      .where(
        and(eq(s.pipelines.taskId, source.taskId), scoped(s.pipelines, scope)),
      )
      .orderBy(desc(s.pipelines.version))
      .limit(1);
    version = (last?.version ?? 0) + 1;
    await tx.insert(s.pipelines).values({
      id: newId,
      taskId: source.taskId,
      version,
      status: "candidate",
      steps: plan,
      paramsSchema: {
        inputNames: plan.inputs,
        parameters: plan.parameters,
        hash: planHash(plan),
      },
      createdFromRunId: source.createdFromRunId,
      generation: source.generation,
      ...scope,
    });
  });
  return { id: newId, version, hash: planHash(plan) };
}
