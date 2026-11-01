import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { guarded, scopeFor, errors } from "../server/rote/action-helpers.js";
import { preparePayoutSample } from "../server/rote/sample-workflow.js";
import { bindingsSchema } from "../shared/rote/pipeline.js";
const example = z.object({
  inputs: bindingsSchema,
  outputTableId: z.string().nullable(),
  sourceOutputTableId: z.string().nullable(),
});
export default defineAction({
  description:
    "Prepare a synthetic three-week payout demo and reference outputs for human review. Uses no model, grants no approval, and creates no active pipeline.",
  schema: z.object({}),
  outputSchema: z.object({
    taskId: z.string(),
    training: example,
    holdout: example,
    next: example,
  }),
  errors,
  run: (_, ctx) => guarded(() => preparePayoutSample(scopeFor(ctx))),
});
