import { createHash } from "node:crypto";

import { vendorCleanupSample } from "../../shared/rote/samples.js";
import { parseFile } from "./io.js";
import { runStep, saveImport, type Scope } from "./repository.js";
import { createTask } from "./workflow.js";

const UNIT_MAP = [
  { from: "EA", to: "each" },
  { from: "each", to: "each" },
  { from: "Each", to: "each" },
  { from: "pcs", to: "each" },
  { from: "BX", to: "box" },
  { from: "box", to: "box" },
  { from: "CS", to: "case" },
];

/** Recorded week-1 steps for the vendor cleanup sample; no model is used. */
export async function recordVendorCleanup(input: string, scope: Scope) {
  let t = await runStep(
    "rename_columns",
    input,
    {
      mapping: {
        " SKU ": "sku",
        "Vendor Name": "vendor",
        "Unit Price": "price",
        UOM: "unit",
      },
    },
    scope,
  );
  t = await runStep(
    "normalize_text",
    t.outputTableId,
    { columns: ["sku"], case: "upper" },
    scope,
  );
  t = await runStep(
    "normalize_text",
    t.outputTableId,
    { columns: ["vendor"], case: "lower" },
    scope,
  );
  t = await runStep(
    "parse_number",
    t.outputTableId,
    { column: "price", currency: "$" },
    scope,
  );
  t = await runStep(
    "map_values",
    t.outputTableId,
    { column: "unit", entries: UNIT_MAP, unmatched: "error" },
    scope,
  );
  // Drop exact duplicate rows only; a SKU with conflicting values must fail
  // the uniqueness check below instead of silently keeping one price.
  t = await runStep(
    "dedupe",
    t.outputTableId,
    { keys: ["sku", "vendor", "price", "unit"] },
    scope,
  );
  return runStep(
    "validate",
    t.outputTableId,
    {
      schema: { price: "number" },
      nonNull: ["sku", "vendor", "price", "unit"],
      unique: [["sku"]],
      rowCount: { min: 1, max: 100000 },
    },
    scope,
  );
}

export async function prepareVendorSample(scope: Scope) {
  const task = await createTask(
      "Sample vendor price-list cleanup",
      "Synthetic weekly vendor price lists: messy headers, spacing and casing, currency strings, unit synonyms and duplicate rows.",
      {},
      scope,
    ),
    weeks = [];
  const hash = (v: string) => createHash("sha256").update(v).digest("hex");
  for (let week = 1; week <= 3; week++) {
    const sample = vendorCleanupSample(week);
    const file = await saveImport(
      await parseFile(Buffer.from(sample.csv), "v.csv"),
      `sample-vendor-prices-week-${week}.csv`,
      scope,
      { sha256: hash(sample.csv), sample: true },
    );
    const inputs = { prices: file.outputTableId };
    if (week === 3) {
      weeks.push({ inputs, outputTableId: null, sourceOutputTableId: null });
      continue;
    }
    const expected = await saveImport(
      sample.expected,
      `sample-vendor-reference-week-${week}`,
      scope,
      { sha256: hash(JSON.stringify(sample.expected)), sample: true },
    );
    const source =
      week === 1 ? await recordVendorCleanup(inputs.prices, scope) : null;
    weeks.push({
      inputs,
      outputTableId: expected.outputTableId,
      sourceOutputTableId: source?.outputTableId ?? null,
    });
  }
  return {
    taskId: task.id,
    training: weeks[0]!,
    holdout: weeks[1]!,
    next: weeks[2]!,
  };
}
