import { createHash } from "node:crypto";

import { payoutSample } from "../../shared/rote/samples.js";
import { parseFile } from "./io.js";
import { saveImport, runStep, type Scope } from "./repository.js";
import { createTask } from "./workflow.js";
export async function preparePayoutSample(scope: Scope) {
  const task = await createTask(
    "Sample payout reconciliation",
    "Synthetic demo prepared without model calls. Review references before approval.",
    {},
    scope,
  );
  const weeks = [];
  for (let week = 1; week <= 3; week++) {
    const sample = payoutSample(week),
      p = await parseFile(Buffer.from(sample.payouts), "p.csv"),
      b = await parseFile(Buffer.from(sample.bank), "b.csv");
    const hash = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    const left = await saveImport(p, `sample-payouts-week-${week}.csv`, scope, {
        sha256: hash(sample.payouts),
        sample: true,
      }),
      right = await saveImport(b, `sample-bank-week-${week}.csv`, scope, {
        sha256: hash(sample.bank),
        sample: true,
      });
    const inputs = { payouts: left.outputTableId, bank: right.outputTableId };
    if (week === 3) {
      weeks.push({ inputs, outputTableId: null, sourceOutputTableId: null });
      continue;
    }
    // Independent synthetic oracle: the generator promises exact, unbatched net settlements.
    const reference = {
      columns: ["payout_id", "net", "amount", "delta"],
      rows: p.rows.map((r) => ({
        payout_id: r.payout_id!,
        net: Number(r.net),
        amount: Number(r.net),
        delta: 0,
      })),
    };
    const expected = await saveImport(
      reference,
      `sample-reference-week-${week}`,
      scope,
      { sha256: hash(JSON.stringify(reference)), sample: true },
    );
    let sourceOutputTableId: string | null = null;
    if (week === 1) {
      const a = await runStep(
          "parse_number",
          inputs.payouts,
          { column: "net" },
          scope,
        ),
        c = await runStep(
          "parse_number",
          inputs.bank,
          { column: "amount", currency: "$" },
          scope,
        );
      let t = await runStep(
        "join",
        a.outputTableId,
        {
          rightTableId: c.outputTableId,
          keys: [{ left: "payout_id", right: "reference" }],
          type: "left",
        },
        scope,
      );
      t = await runStep(
        "compute_column",
        t.outputTableId,
        { newColumn: "delta", formula: "[net] - [amount]" },
        scope,
      );
      t = await runStep(
        "compute_column",
        t.outputTableId,
        { newColumn: "delta_squared", formula: "[delta] * [delta]" },
        scope,
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
      );
      t = await runStep(
        "select_columns",
        t.outputTableId,
        { columns: reference.columns },
        scope,
      );
      sourceOutputTableId = t.outputTableId;
    }
    weeks.push({
      inputs,
      outputTableId: expected.outputTableId,
      sourceOutputTableId,
    });
  }
  return {
    taskId: task.id,
    training: weeks[0]!,
    holdout: weeks[1]!,
    next: weeks[2]!,
  };
}
