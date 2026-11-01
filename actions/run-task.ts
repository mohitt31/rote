import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { runTask } from "../server/rote/workflow.js";
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
    "Run the approved pipeline with named imported table IDs, without model calls; schema drift stops execution and requires review.",
  schema: z.object({
    taskId: z.string().uuid(),
    inputs: bindingsSchema,
    parameterValues: parameterValuesSchema,
  }),
  outputSchema: z.object({
    id: z.string(),
    status: z.enum(["succeeded", "drift"]),
    outputTableId: z.string().nullable(),
    durationMs: z.number(),
    tokensIn: z.literal(0),
    tokensOut: z.literal(0),
    message: z.string(),
  }),
  errors,
  mcpTool: true,
  run: (a, ctx) =>
    guarded(() =>
      runTask(a.taskId, a.inputs, scopeFor(ctx), a.parameterValues),
    ),
});
