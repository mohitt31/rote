import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { crystallizeTask } from "../server/rote/workflow.js";
import { bindingsSchema, toleranceSchema } from "../shared/rote/pipeline.js";
import {
  taskSchema,
  taskDetailSchema,
} from "../shared/rote/workflow-output.js";
export default defineAction({
  description:
    "Extract an immutable candidate pipeline from an approved training example and recorded step lineage; never reads holdout data.",
  schema: z.object({ taskId: z.string().uuid() }),
  outputSchema: z.object({
    id: z.string(),
    version: z.number(),
    hash: z.string(),
    stepCount: z.number(),
  }),
  errors,
  run: (a, ctx) => guarded(() => crystallizeTask(a.taskId, scopeFor(ctx))),
});
