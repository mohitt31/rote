import { writeFile, mkdir } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";

import { applyStep } from "../server/rote/steps.js";
import type { Table } from "../shared/rote/model.js";
const input: Table = {
  columns: ["id", "name", "amount"],
  rows: Array.from({ length: 10000 }, (_, i) => ({
    id: `id-${i}`,
    name: `  Vendor   ${i % 100} `,
    amount: "$1,234.50",
  })),
};
function run() {
  let t = applyStep("parse_number", input, { column: "amount", currency: "$" });
  t = applyStep("normalize_text", t, { columns: ["name"], case: "lower" });
  t = applyStep("compute_column", t, {
    newColumn: "net",
    formula: "[amount] - 10",
  });
  t = applyStep("dedupe", t, { keys: ["id"] });
  t = applyStep("sort", t, { by: [{ column: "id" }] });
  return applyStep("validate", t, {
    schema: { net: "number" },
    nonNull: ["id"],
    unique: [["id"]],
    rowCount: { min: 10000, max: 10000 },
  });
}
run();
const durations: number[] = [];
for (let i = 0; i < 20; i++) {
  const start = performance.now();
  const out = run();
  durations.push(performance.now() - start);
  if (out.rows.length !== 10000 || out.rows.some((r) => r.net !== 1224.5))
    throw Error("Unexpected pipeline output");
}
const ordered = [...durations].sort((a, b) => a - b);
const result = {
  label:
    "Sample in-memory primitive benchmark; NOT the agent-versus-pipeline benchmark",
  date: new Date().toISOString(),
  machine: {
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    node: process.version,
  },
  inputRows: 10000,
  steps: [
    "parse_number",
    "normalize_text",
    "compute_column",
    "dedupe",
    "sort",
    "validate",
  ],
  runs: 20,
  warmupRuns: 1,
  durationMs: durations,
  medianMs: (ordered[9]! + ordered[10]!) / 2,
  p95Ms: ordered[18],
  includes:
    "Transformation and validation only. Excludes CSV parsing, SQL persistence, HTTP and UI.",
  llmCalls: 0,
};
await mkdir("benchmark", { recursive: true });
await writeFile(
  "benchmark/primitives.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    medianMs: result.medianMs,
    p95Ms: result.p95Ms,
    inputRows: 10000,
    runs: 20,
  }),
);
