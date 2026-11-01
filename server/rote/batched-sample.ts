import { createHash } from "node:crypto";

import type { Table } from "../../shared/rote/model.js";
import { batchedPayoutSample } from "../../shared/rote/samples.js";
import { parseFile } from "./io.js";
import { saveImport, runStep, type Scope } from "./repository.js";
import { createTask } from "./workflow.js";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

/**
 * The bank's "v2" export: amount column renamed to amount_cents and ISO
 * booking dates. Used to demonstrate drift and re-teaching. Sample data only.
 */
export function bankExportV2(bank: Table): Table {
  return {
    columns: bank.columns.map((c) =>
      c === "amount_minor" ? "amount_cents" : c,
    ),
    rows: bank.rows.map(({ amount_minor, ...r }) => ({
      ...r,
      amount_cents: amount_minor ?? null,
      booking_date: String(r.booking_date).replace(
        /^(\d{2})\/(\d{2})\/(\d{4})$/,
        "$3-$2-$1",
      ),
    })),
  };
}

/** Recorded reconciliation steps; no model is used. */
export async function recordBatchedReconciliation(
  inputs: { payouts: string; bank: string },
  columns: string[],
  scope: Scope,
  bankFormat: "v1" | "v2" = "v1",
) {
  let left = await runStep(
    "parse_number",
    inputs.payouts,
    { column: "net_cents" },
    scope,
  );
  left = await runStep(
    "parse_date",
    left.outputTableId,
    { column: "expected_date", formats: ["yyyy-MM-dd"], timezone: "UTC" },
    scope,
  );
  left = await runStep(
    "group_aggregate",
    left.outputTableId,
    {
      keys: ["settlement_id", "expected_date"],
      aggregates: [
        { op: "sum", column: "net_cents", newColumn: "net_cents" },
        { op: "count", newColumn: "transaction_count" },
      ],
    },
    scope,
  );
  let bank = inputs.bank;
  if (bankFormat === "v2")
    bank = (
      await runStep(
        "rename_columns",
        bank,
        { mapping: { amount_cents: "amount_minor" } },
        scope,
      )
    ).outputTableId;
  let right = await runStep(
    "parse_number",
    bank,
    { column: "amount_minor" },
    scope,
  );
  right = await runStep(
    "parse_date",
    right.outputTableId,
    {
      column: "booking_date",
      formats: [bankFormat === "v2" ? "yyyy-MM-dd" : "dd/MM/yyyy"],
      timezone: "UTC",
    },
    scope,
  );
  right = await runStep(
    "validate",
    right.outputTableId,
    {
      unique: [["reference"]],
      nonNull: ["reference", "amount_minor", "booking_date"],
    },
    scope,
  );
  let out = await runStep(
    "join",
    left.outputTableId,
    {
      rightTableId: right.outputTableId,
      keys: [{ left: "settlement_id", right: "reference" }],
      type: "left",
      date: { left: "expected_date", right: "booking_date", windowDays: 3 },
    },
    scope,
  );
  out = await runStep(
    "compute_column",
    out.outputTableId,
    { newColumn: "delta_cents", formula: "[net_cents] - [amount_minor]" },
    scope,
  );
  out = await runStep(
    "compute_column",
    out.outputTableId,
    { newColumn: "squared_delta", formula: "[delta_cents] * [delta_cents]" },
    scope,
  );
  out = await runStep(
    "validate",
    out.outputTableId,
    {
      unique: [["settlement_id"]],
      nonNull: ["settlement_id", "amount_minor", "transaction_count"],
      sumEquals: [{ column: "squared_delta", value: 0 }],
      rowCount: { min: 1, max: 100000 },
    },
    scope,
  );
  return runStep("select_columns", out.outputTableId, { columns }, scope);
}

async function importWeek(week: number, scope: Scope, bankFormat: "v1" | "v2") {
  const sample = batchedPayoutSample(week);
  const parsedBank = await parseFile(Buffer.from(sample.bank), "b.csv");
  const bank = bankFormat === "v2" ? bankExportV2(parsedBank) : parsedBank;
  const suffix = bankFormat === "v2" ? "-v2-format" : "";
  const p = await saveImport(
      await parseFile(Buffer.from(sample.payouts), "p.csv"),
      `sample-batched-payouts-week-${week}.csv`,
      scope,
      { sha256: hash(sample.payouts), sample: true },
    ),
    b = await saveImport(
      bank,
      `sample-batched-bank-week-${week}${suffix}.csv`,
      scope,
      {
        sha256: hash(JSON.stringify(bank)),
        sample: true,
      },
    );
  return {
    sample,
    inputs: { payouts: p.outputTableId, bank: b.outputTableId },
  };
}

async function prepareWeeks(
  first: number,
  scope: Scope,
  bankFormat: "v1" | "v2",
) {
  const weeks = [];
  for (let week = first; week < first + 3; week++) {
    const { sample, inputs } = await importWeek(week, scope, bankFormat);
    if (week === first + 2) {
      weeks.push({ inputs, outputTableId: null, sourceOutputTableId: null });
      continue;
    }
    const expected = await saveImport(
      sample.expected,
      `sample-batched-reference-week-${week}`,
      scope,
      { sha256: hash(JSON.stringify(sample.expected)), sample: true },
    );
    const source =
      week === first
        ? await recordBatchedReconciliation(
            inputs,
            sample.expected.columns,
            scope,
            bankFormat,
          )
        : null;
    weeks.push({
      inputs,
      outputTableId: expected.outputTableId,
      sourceOutputTableId: source?.outputTableId ?? null,
    });
  }
  return { training: weeks[0]!, holdout: weeks[1]!, next: weeks[2]! };
}

export async function prepareBatchedSample(scope: Scope) {
  const task = await createTask(
    "Sample batched payout reconciliation",
    "Synthetic USD settlements: batched transactions, refunds, rounded fees, 1–3 day bank delays and reordered statements. Monetary checks use integer cents.",
    {},
    scope,
  );
  return { taskId: task.id, ...(await prepareWeeks(1, scope, "v1")) };
}

/**
 * Weeks 4–6 in the bank's changed export format, with recorded week-4 steps
 * and independent references, for re-teaching an existing task as v2.
 */
export async function prepareBankFormatChange(taskId: string, scope: Scope) {
  return { taskId, ...(await prepareWeeks(4, scope, "v2")) };
}
