import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { prepareBankFormatChange } from "../server/rote/batched-sample.js";
import { taskById } from "../server/rote/workflow.js";
import { bindingsSchema } from "../shared/rote/pipeline.js";
const example = z.object({
  inputs: bindingsSchema,
  outputTableId: z.string().nullable(),
  sourceOutputTableId: z.string().nullable(),
});
export default defineAction({
  description:
    "For an existing sample payout task, import synthetic weeks 4–6 in the bank's changed export format (renamed amount column, ISO dates) with recorded week-4 steps and references, to demonstrate drift and re-teaching. Uses no model and grants no approval.",
  schema: z.object({ taskId: z.string().uuid() }),
  outputSchema: z.object({
    taskId: z.string(),
    training: example,
    holdout: example,
    next: example,
  }),
  errors,
  run: ({ taskId }, ctx) =>
    guarded(async () => {
      await taskById(taskId, scopeFor(ctx));
      return prepareBankFormatChange(taskId, scopeFor(ctx));
    }),
});
