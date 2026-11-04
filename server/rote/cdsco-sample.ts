// Real-data task: CDSCO NSQ monthly drug alerts (Jan–Mar 2026, bundled as
// published). January's steps are recorded here without a model, exactly
// like the synthetic samples; January and February get reference outputs
// from the independent plain-code implementation for a person to review;
// March is the unseen next month. Nothing is approved or promoted.
import {
  CDSCO_MONTHS,
  CDSCO_SOURCE,
  CDSCO_STEPS,
  cdscoReference,
  cdscoTable,
} from "../../shared/rote/cdsco.js";
import type { StepName } from "../../shared/rote/model.js";
import { runStep, saveImport, type Scope } from "./repository.js";
import { createTask } from "./workflow.js";

/** Run the recorded CDSCO steps on one month's imported table. */
export async function recordCdscoCleanup(input: string, scope: Scope) {
  let id = input;
  for (const step of CDSCO_STEPS)
    id = (
      await runStep(step.action as StepName, id, structuredClone(step.params), scope)
    ).outputTableId;
  return id;
}

export async function prepareCdscoTask(scope: Scope) {
  const task = await createTask(
    "CDSCO drug alerts: monthly clean list",
    `Real public data. ${CDSCO_SOURCE} Each month: manufacturer name from the address, the failed test as a category, expiry month as a date, consistent reporting source.`,
    {},
    scope,
  );
  const months = [];
  for (const [i, month] of CDSCO_MONTHS.entries()) {
    const file = await saveImport(
      cdscoTable(month),
      `cdsco-nsq-${month.month}.json`,
      scope,
      { sha256: month.sha256, sample: false },
    );
    const inputs = { nsq: file.outputTableId };
    if (i === 2) {
      months.push({ inputs, outputTableId: null, sourceOutputTableId: null });
      continue;
    }
    const reference = cdscoReference(month);
    const expected = await saveImport(
      reference,
      `cdsco-reference-${month.month}`,
      scope,
      { sha256: month.sha256, sample: false },
    );
    const source = i === 0 ? await recordCdscoCleanup(inputs.nsq, scope) : null;
    months.push({
      inputs,
      outputTableId: expected.outputTableId,
      sourceOutputTableId: source,
    });
  }
  return {
    taskId: task.id,
    training: months[0]!,
    holdout: months[1]!,
    next: months[2]!,
  };
}
