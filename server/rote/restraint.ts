// Restraint report: which agent work keeps repeating and could be a pipeline.
// Reads Rote's own step log (recorded step calls carry the framework run ID)
// and the framework's per-run trace totals through a read-only projection of
// the Core-owned summary table (same columns as trace-evidence.ts, verified
// against Core 0.222.2). Numbers come only from recorded runs; nothing is
// estimated or extrapolated here.
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { bigint, pgTable, text } from "drizzle-orm/pg-core";

import { planSchema } from "../../shared/rote/pipeline.js";
import { getDb, schema as s } from "../db/index.js";
import { requireScope, type Scope } from "./repository.js";
import { scoped } from "./workflow.js";

const summaries = pgTable("agent_trace_summaries", {
  runId: text("run_id"),
  userId: text("user_id"),
  orgId: text("org_id"),
  tokensIn: bigint("total_input_tokens", { mode: "number" }),
  tokensOut: bigint("total_output_tokens", { mode: "number" }),
  cost: bigint("total_cost_cents_x100", { mode: "number" }),
  durationMs: bigint("total_duration_ms", { mode: "number" }),
  model: text("model"),
});

/** Order-insensitive signature: parallel branches may interleave. */
export const signatureOf = (actions: string[]) =>
  [...actions].sort().join("+");

export type RestraintGroup = {
  signature: string;
  steps: number;
  actions: Record<string, number>;
  agentRuns: number;
  tracedRuns: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  agentMs: number;
  coveredBy: { taskId: string; taskName: string; version: number }[];
};

export function groupRuns(
  logs: { traceRunId: string; action: string }[],
  traces: Map<
    string,
    { tokensIn: number; tokensOut: number; cost: number; durationMs: number }
  >,
  pipelines: { taskId: string; taskName: string; version: number; actions: string[] }[],
): RestraintGroup[] {
  const byRun = new Map<string, string[]>();
  for (const l of logs) {
    const list = byRun.get(l.traceRunId) ?? [];
    list.push(l.action);
    byRun.set(l.traceRunId, list);
  }
  const groups = new Map<string, RestraintGroup>();
  for (const [runId, actions] of byRun) {
    const signature = signatureOf(actions);
    let g = groups.get(signature);
    if (!g) {
      const counts: Record<string, number> = {};
      for (const a of actions) counts[a] = (counts[a] ?? 0) + 1;
      g = {
        signature,
        steps: actions.length,
        actions: counts,
        agentRuns: 0,
        tracedRuns: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        agentMs: 0,
        coveredBy: pipelines
          .filter((p) => signatureOf(p.actions) === signature)
          .map(({ taskId, taskName, version }) => ({ taskId, taskName, version })),
      };
      groups.set(signature, g);
    }
    g.agentRuns++;
    const t = traces.get(runId);
    if (t) {
      g.tracedRuns++;
      g.tokensIn += t.tokensIn;
      g.tokensOut += t.tokensOut;
      g.costUsd += t.cost / 10000;
      g.agentMs += t.durationMs;
    }
  }
  return [...groups.values()].sort(
    (a, b) => b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut),
  );
}

export async function restraintReport(scope: Scope) {
  requireScope(scope);
  const logs = (
    await getDb()
      .select({ traceRunId: s.stepLog.traceRunId, action: s.stepLog.action })
      .from(s.stepLog)
      .where(and(scoped(s.stepLog, scope), isNotNull(s.stepLog.traceRunId)))
      .orderBy(s.stepLog.createdAt)
      .limit(5000)
  ).filter((l): l is { traceRunId: string; action: string } => !!l.traceRunId);
  const runIds = [...new Set(logs.map((l) => l.traceRunId))].slice(-500);
  const traces = new Map<
    string,
    { tokensIn: number; tokensOut: number; cost: number; durationMs: number }
  >();
  if (runIds.length) {
    const rows = await getDb()
      .select()
      .from(summaries)
      .where(
        and(
          inArray(summaries.runId, runIds),
          eq(summaries.userId, scope.ownerEmail),
          scope.orgId === null
            ? isNull(summaries.orgId)
            : eq(summaries.orgId, scope.orgId),
        ),
      );
    for (const r of rows)
      if (r.runId)
        traces.set(r.runId, {
          tokensIn: r.tokensIn ?? 0,
          tokensOut: r.tokensOut ?? 0,
          cost: r.cost ?? 0,
          durationMs: r.durationMs ?? 0,
        });
  }
  const approved = await getDb()
    .select({
      taskId: s.pipelines.taskId,
      version: s.pipelines.version,
      steps: s.pipelines.steps,
      taskName: s.tasks.name,
    })
    .from(s.pipelines)
    .innerJoin(s.tasks, eq(s.tasks.id, s.pipelines.taskId))
    .where(and(scoped(s.pipelines, scope), eq(s.pipelines.status, "approved")));
  const pipelines = approved.map((p) => ({
    taskId: p.taskId,
    taskName: p.taskName,
    version: p.version,
    actions: planSchema.parse(p.steps).steps.map((st) => st.action),
  }));
  const groups = groupRuns(
    logs.filter((l) => runIds.includes(l.traceRunId)),
    traces,
    pipelines,
  );
  return {
    groups: groups.slice(0, 20),
    note: "Agent runs that called Rote step actions, grouped by the steps they used. Token, cost and time totals come from completed framework traces only; cost is provider list-price metadata, not a bill.",
  };
}
