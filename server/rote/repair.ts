// Deterministic drift repair: when an approved pipeline stops because an
// input's format changed, try to explain the change without a model and
// re-run the same recorded steps on the new week. Only two kinds of change are
// handled: a renamed column whose values look the same, and a date column
// whose format changed. Anything else is reported as unsupported so that the
// agent (or a person) takes over. The result is a NEW recorded output for a
// person to review and approve as the training example of the next format
// generation; nothing is promoted or approved here.
import { and, eq } from "drizzle-orm";

import {
  stepSchemas,
  type StepName,
  type Table,
} from "../../shared/rote/model.js";
import { planSchema, type Plan } from "../../shared/rote/pipeline.js";
import { getDb, schema as s } from "../db/index.js";
import { fingerprint } from "./fingerprint.js";
import { resolveParameters, substituteParameters } from "./pipeline-engine.js";
import {
  readTable,
  runStep,
  RoteError,
  type Scope,
} from "./repository.js";
import { applyStep } from "./steps.js";
import { scoped, taskById } from "./workflow.js";

export type DriftChange =
  | { kind: "rename"; input: string; from: string; to: string }
  | {
      kind: "date_format";
      input: string;
      column: string;
      from: string[];
      to: string;
    };

export type DriftFix =
  | {
      status: "proposed";
      changes: DriftChange[];
      sourceOutputTableId: string;
      rowCount: number;
      columns: string[];
      modelCalls: 0;
      durationMs: number;
    }
  | { status: "unsupported"; reason: string; modelCalls: 0; durationMs: number }
  | { status: "no_drift"; reason: string; modelCalls: 0; durationMs: number };

// Formats tried for a date column whose declared format stopped matching.
// Order matters only for reporting; ambiguity is detected, not guessed.
export const CANDIDATE_DATE_FORMATS = [
  "yyyy-MM-dd",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "d/M/yyyy",
  "M/d/yyyy",
  "dd-MM-yyyy",
  "MM-dd-yyyy",
  "dd.MM.yyyy",
  "yyyy/MM/dd",
  "yyyyMMdd",
  "d MMM yyyy",
  "dd MMM yyyy",
  "MMM d, yyyy",
  "ISO",
];

type Profile = "empty" | "integer" | "decimal" | "date" | "text";
const DATE_LIKE =
  /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{8}|\d{1,2} [A-Za-z]{3} \d{4}|[A-Za-z]{3} \d{1,2}, \d{4})(T.*)?$/;
function profile(table: Table, column: string): Profile {
  const values = table.rows
    .map((r) => r[column])
    .filter((v) => v !== null && String(v).trim() !== "")
    .slice(0, 200)
    .map((v) => String(v).trim());
  if (!values.length) return "empty";
  if (values.every((v) => DATE_LIKE.test(v))) return "date";
  if (values.every((v) => /^[-+]?\d+$/.test(v.replace(/[,\s]/g, ""))))
    return "integer";
  if (
    values.every((v) =>
      /^[-+(]?[^\d-+]{0,3}\d[\d,.\s]*\)?[^\d]{0,3}$/.test(v),
    )
  )
    return "decimal";
  return "text";
}
const tokens = (name: string) =>
  new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
function similarity(a: string, b: string) {
  const x = tokens(a),
    y = tokens(b);
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / Math.max(1, Math.max(x.size, y.size));
}

/**
 * Pair columns that disappeared with columns that appeared, using only the
 * value profile and name tokens. Returns null when any pairing is ambiguous.
 */
export function pairRenames(
  expected: Table,
  actual: Table,
): { mapping: Record<string, string>; reason?: string } {
  const missing = expected.columns.filter((c) => !actual.columns.includes(c));
  const extra = actual.columns.filter((c) => !expected.columns.includes(c));
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const m of missing) {
    const want = profile(expected, m);
    const candidates = extra.filter(
      (c) => !used.has(c) && profile(actual, c) === want,
    );
    if (!candidates.length)
      return {
        mapping: {},
        reason: `Column "${m}" is missing and no new column has the same kind of values`,
      };
    let choice = candidates[0]!;
    if (candidates.length > 1) {
      const scored = candidates
        .map((c) => ({ c, score: similarity(m, c) }))
        .sort((a, b) => b.score - a.score);
      if (scored[0]!.score === 0 || scored[0]!.score === scored[1]!.score)
        return {
          mapping: {},
          reason: `Column "${m}" is missing and more than one new column could replace it`,
        };
      choice = scored[0]!.c;
    }
    mapping[choice] = m;
    used.add(choice);
  }
  return { mapping };
}

/** Return the single candidate format that parses every non-empty value. */
export function detectDateFormat(
  table: Table,
  column: string,
  timezone: string,
): { format?: string; reason?: string } {
  const fits = CANDIDATE_DATE_FORMATS.filter((f) => {
    try {
      applyStep("parse_date", table, { column, formats: [f], timezone });
      return true;
    } catch {
      return false;
    }
  });
  if (!fits.length)
    return { reason: `No known date format matches column "${column}"` };
  // ISO accepts anything yyyy-MM-dd accepts; prefer the explicit format.
  const explicit = fits.filter((f) => f !== "ISO");
  if (explicit.length > 1)
    return {
      reason: `Dates in "${column}" fit several formats (${explicit.join(", ")}); a person must choose`,
    };
  return { format: explicit[0] ?? fits[0]! };
}

type Step = Plan["steps"][number];
const shift = (ref: string, by: number) => {
  const m = /^step:(\d+)$/.exec(ref);
  return m ? `step:${Number(m[1]) + by}` : ref;
};

async function activePipeline(taskId: string, scope: Scope) {
  const task = await taskById(taskId, scope);
  if (!task.currentPipelineId)
    throw new RoteError("Promote a verified pipeline first");
  const [p] = await getDb()
    .select()
    .from(s.pipelines)
    .where(
      and(eq(s.pipelines.id, task.currentPipelineId), scoped(s.pipelines, scope)),
    )
    .limit(1);
  if (!p || p.status !== "approved")
    throw new RoteError("Active pipeline is not approved");
  return p;
}

async function trainingInputs(
  taskId: string,
  generation: number,
  scope: Scope,
) {
  const [example] = await getDb()
    .select()
    .from(s.goldenExamples)
    .where(
      and(
        eq(s.goldenExamples.taskId, taskId),
        eq(s.goldenExamples.generation, generation),
        eq(s.goldenExamples.holdout, false),
        scoped(s.goldenExamples, scope),
      ),
    )
    .limit(1);
  if (!example) throw new RoteError("Training example for this version is missing");
  return example.inputBindings as Record<string, string>;
}

/**
 * Explain a drifted week with renames and date-format changes only, then run
 * the adjusted steps as recorded actions so the new output has lineage.
 */
export async function proposeDriftFix(
  taskId: string,
  bindings: Record<string, string>,
  scope: Scope,
): Promise<DriftFix> {
  const started = performance.now();
  const done = <T extends object>(v: T) => ({
    ...v,
    modelCalls: 0 as const,
    durationMs: performance.now() - started,
  });
  const p = await activePipeline(taskId, scope);
  const plan = planSchema.parse(p.steps);
  if (
    Object.keys(bindings).sort().join("|") !== [...plan.inputs].sort().join("|")
  )
    throw new RoteError("Input names differ from the active pipeline");
  const expectedIds = await trainingInputs(taskId, p.generation, scope);
  const actual: Record<string, Table> = {};
  for (const [name, id] of Object.entries(bindings))
    actual[name] = await readTable(id, scope);

  const changes: DriftChange[] = [];
  const prefix: Step[] = [];
  const inputRef: Record<string, string> = {};
  let drifted = false;
  for (const name of plan.inputs) {
    inputRef[name] = `input:${name}`;
    const got = actual[name]!;
    if (fingerprint(got).hash === plan.fingerprints[name]) continue;
    drifted = true;
    const expected = await readTable(expectedIds[name]!, scope);
    const { mapping, reason } = pairRenames(expected, got);
    if (reason) return done({ status: "unsupported" as const, reason });
    if (Object.keys(mapping).length) {
      for (const [from, to] of Object.entries(mapping))
        changes.push({ kind: "rename", input: name, from, to });
      prefix.push({
        action: "rename_columns",
        input: `input:${name}`,
        params: { mapping },
      });
      inputRef[name] = `step:${prefix.length - 1}`;
    }
  }
  if (!drifted && !plan.steps.some((st) => st.action === "parse_date"))
    return done({
      status: "no_drift" as const,
      reason: "Inputs match the approved format",
    });

  const k = prefix.length;
  const parameters = resolveParameters(plan, {});
  const steps: Step[] = [
    ...prefix,
    ...plan.steps.map((st) => {
      const remap = (ref: string) =>
        ref.startsWith("input:") ? inputRef[ref.slice(6)]! : shift(ref, k);
      const params = substituteParameters(st.params, parameters) as Record<
        string,
        unknown
      >;
      return {
        ...st,
        input: remap(st.input),
        ...(st.right ? { right: remap(st.right) } : {}),
        params:
          st.action === "join" && st.right
            ? { ...params, rightTableId: remap(st.right) }
            : params,
      };
    }),
  ];

  // Dry run in memory: fix date formats where the declared one no longer fits.
  const origin = (ref: string): string => {
    if (ref.startsWith("input:")) return ref.slice(6);
    const st = steps[Number(ref.slice(5))]!;
    return origin(st.input);
  };
  const values = new Map<string, Table>();
  for (const name of plan.inputs) values.set(`input:${name}`, actual[name]!);
  for (const [i, st] of steps.entries()) {
    const input = values.get(st.input)!,
      right = st.right ? values.get(st.right) : undefined;
    const name = st.action as StepName;
    let out: Table;
    try {
      out = applyStep(name, input, stepSchemas[name].parse(st.params), right);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Step failed";
      if (name !== "parse_date" || !/Date does not match/.test(message))
        return done({
          status: "unsupported" as const,
          reason: `Step ${i + 1} (${name}) still fails after the format checks: ${message}`,
        });
      const params = st.params as {
        column: string;
        formats: string[];
        timezone: string;
      };
      const found = detectDateFormat(input, params.column, params.timezone);
      if (!found.format)
        return done({ status: "unsupported" as const, reason: found.reason! });
      changes.push({
        kind: "date_format",
        input: origin(st.input),
        column: params.column,
        from: params.formats,
        to: found.format,
      });
      st.params = { ...params, formats: [found.format] };
      out = applyStep(name, input, stepSchemas[name].parse(st.params), right);
    }
    values.set(`step:${i}`, out);
  }
  if (!changes.length)
    return done({
      status: drifted ? ("unsupported" as const) : ("no_drift" as const),
      reason: drifted
        ? "The input format changed in a way Rote cannot explain without review"
        : "Inputs match the approved format",
    });

  // Record the adjusted steps so the output carries lineage for crystallizing.
  const ids = new Map<string, string>(Object.entries(bindings).map(([n, id]) => [`input:${n}`, id]));
  for (const [i, st] of steps.entries()) {
    const params =
      st.action === "join" && st.right
        ? { ...st.params, rightTableId: ids.get(st.right)! }
        : st.params;
    const out = await runStep(
      st.action as StepName,
      ids.get(st.input)!,
      params,
      scope,
    );
    ids.set(`step:${i}`, out.outputTableId);
  }
  const outputId = ids.get(shift(plan.output, k))!;
  const output = await readTable(outputId, scope);
  return done({
    status: "proposed" as const,
    changes,
    sourceOutputTableId: outputId,
    rowCount: output.rowCount,
    columns: output.columns,
  });
}
