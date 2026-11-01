import { and, eq, isNull } from "drizzle-orm";
import { pgTable, text, integer, doublePrecision } from "drizzle-orm/pg-core";

import { getDb } from "../db/index.js";
import { requireScope, type Scope } from "./repository.js";
// Read-only projections of Core 0.222.2-owned tables, verified against its store.js.
// Core owns their migrations. Its observability store is not a public package export.
const summaries = pgTable("agent_trace_summaries", {
  runId: text("run_id"),
  userId: text("user_id"),
  orgId: text("org_id"),
  llmCalls: integer("llm_calls"),
  tokensIn: integer("total_input_tokens"),
  tokensOut: integer("total_output_tokens"),
  cost: doublePrecision("total_cost_cents_x100"),
  durationMs: doublePrecision("total_duration_ms"),
});
const spans = pgTable("agent_trace_spans", {
  runId: text("run_id"),
  userId: text("user_id"),
  orgId: text("org_id"),
  spanType: text("span_type"),
  parentSpanId: text("parent_span_id"),
  status: text("status"),
});
export async function traceEvidence(traceIds: (string | null)[], scope: Scope) {
  requireScope(scope);
  const ids = new Set(traceIds);
  if (ids.size !== 1 || ids.has(null)) return null;
  const id = [...ids][0];
  if (!id) return null;
  const [summary] = await getDb()
    .select()
    .from(summaries)
    .where(
      and(
        eq(summaries.runId, id),
        eq(summaries.userId, scope.ownerEmail),
        scope.orgId === null
          ? isNull(summaries.orgId)
          : eq(summaries.orgId, scope.orgId),
      ),
    )
    .limit(1);
  if (!summary || !summary.llmCalls) return null;
  const [root] = await getDb()
    .select()
    .from(spans)
    .where(
      and(
        eq(spans.runId, id),
        eq(spans.userId, scope.ownerEmail),
        scope.orgId === null
          ? isNull(spans.orgId)
          : eq(spans.orgId, scope.orgId),
        eq(spans.spanType, "agent_run"),
        isNull(spans.parentSpanId),
        eq(spans.status, "success"),
      ),
    )
    .limit(1);
  if (!root) return null;
  return {
    traceRunId: id,
    tokensIn: summary.tokensIn,
    tokensOut: summary.tokensOut,
    cost: summary.cost === null ? null : summary.cost / 10000,
    durationMs: summary.durationMs,
  };
}
