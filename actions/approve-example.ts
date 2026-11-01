import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { approveExample } from "../server/rote/workflow.js";
import {
  bindingsSchema,
  toleranceSchema,
  parameterValuesSchema,
} from "../shared/rote/pipeline.js";
import {
  taskSchema,
  taskDetailSchema,
} from "../shared/rote/workflow-output.js";
export default defineAction({
  description:
    "Approve reviewed reference output as a training or holdout example. Requires human approval. Examples freeze on crystallization.",
  schema: z.object({
    taskId: z.string().uuid(),
    inputs: bindingsSchema,
    parameterValues: parameterValuesSchema,
    outputTableId: z.string().uuid(),
    sourceOutputTableId: z.string().uuid().optional(),
    holdout: z.boolean().default(false),
  }),
  outputSchema: z.object({ id: z.string() }),
  errors,
  needsApproval: true,
  run: (a, ctx) => guarded(() => approveExample(a, scopeFor(ctx))),
});
