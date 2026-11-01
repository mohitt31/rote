import { createHash } from "node:crypto";

import {
  checkTable,
  stepSchemas,
  type Table,
  type StepName,
} from "../../shared/rote/model.js";
import { planSchema, type Plan } from "../../shared/rote/pipeline.js";
import { fingerprint } from "./fingerprint.js";
import { applyStep } from "./steps.js";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const planHash = (plan: Plan) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(planSchema.parse(plan))))
    .digest("hex");
export function replay(raw: unknown, inputs: Record<string, Table>): Table {
  const plan = planSchema.parse(raw),
    values = new Map<string, Table>();
  if (
    Object.keys(inputs).sort().join("|") !== [...plan.inputs].sort().join("|")
  )
    throw Error("Input names differ from pipeline");
  for (const name of plan.inputs) {
    const t = inputs[name]!;
    checkTable(t);
    if (fingerprint(t).hash !== plan.fingerprints[name])
      throw Error(`Input schema drift: ${name}`);
    values.set(`input:${name}`, t);
  }
  for (const [i, step] of plan.steps.entries()) {
    const input = values.get(step.input),
      right = step.right ? values.get(step.right) : undefined;
    if (
      !input ||
      (step.action === "join" && !right) ||
      (step.action !== "join" && step.right)
    )
      throw Error("Invalid pipeline dependency");
    const params = stepSchemas[step.action].parse(step.params);
    const output = applyStep(step.action, input, params, right);
    checkTable(output);
    values.set(`step:${i}`, output);
  }
  const output = values.get(plan.output);
  if (!output) throw Error("Pipeline output missing");
  return output;
}
export type RecordedStep = {
  action: string;
  inputTableId: string;
  outputTableId: string;
  params: unknown;
};
export async function extractPlan(
  bindings: Record<string, string>,
  outputId: string,
  readInput: (id: string) => Promise<Table>,
  readStep: (id: string) => Promise<RecordedStep | undefined>,
): Promise<Plan> {
  const refs = new Map<string, string>(),
    fingerprints: Record<string, string> = {},
    steps: Plan["steps"] = [],
    visiting = new Set<string>();
  for (const [name, id] of Object.entries(bindings)) {
    if (refs.has(id)) throw Error("Each named input must be distinct");
    refs.set(id, `input:${name}`);
    fingerprints[name] = fingerprint(await readInput(id)).hash;
  }
  async function visit(id: string): Promise<string> {
    const ref = refs.get(id);
    if (ref) return ref;
    if (visiting.has(id) || visiting.size >= 100 || steps.length >= 100)
      throw Error("Cyclic or oversized lineage");
    visiting.add(id);
    const log = await readStep(id);
    if (!log) throw Error("Output lineage does not reach the named inputs");
    if (!Object.prototype.hasOwnProperty.call(stepSchemas, log.action))
      throw Error("Unknown recorded action");
    const action = log.action as StepName,
      params = stepSchemas[action].parse(log.params),
      input = await visit(log.inputTableId);
    const right =
      action === "join"
        ? await visit((params as { rightTableId: string }).rightTableId)
        : undefined;
    const recorded = { ...params } as Record<string, unknown>;
    if (right) recorded.rightTableId = right;
    const next = `step:${steps.length}`;
    steps.push({
      action,
      input,
      ...(right ? { right } : {}),
      params: recorded,
    });
    refs.set(id, next);
    visiting.delete(id);
    return next;
  }
  const output = await visit(outputId);
  const used = new Set(
    steps.flatMap((s) =>
      [s.input, s.right].filter(
        (r): r is string => !!r && r.startsWith("input:"),
      ),
    ),
  );
  if (Object.keys(bindings).some((n) => !used.has(`input:${n}`)))
    throw Error("Named inputs must all be used by recorded steps");
  return planSchema.parse({
    inputs: Object.keys(bindings).sort(),
    fingerprints,
    steps,
    output,
  });
}
