import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { verifyPipeline } from "../server/rote/workflow.js";
import { bindingsSchema, toleranceSchema } from "../shared/rote/pipeline.js";
import {
  taskSchema,
  taskDetailSchema,
} from "../shared/rote/workflow-output.js";
export default defineAction({
  description:
    "Self-test the comparator and replay all frozen training and holdout examples. Returns bounded pass/fail evidence.",
  schema: z.object({ id: z.string().uuid() }),
  outputSchema: z.object({
    id: z.string(),
    pipelineId: z.string(),
    hash: z.string(),
    pass: z.boolean(),
    exampleCount: z.number(),
  }),
  errors,
  run: (a, ctx) => guarded(() => verifyPipeline(a.id, scopeFor(ctx))),
});
