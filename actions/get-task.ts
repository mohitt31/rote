import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { getTask } from "../server/rote/workflow.js";
import { bindingsSchema, toleranceSchema } from "../shared/rote/pipeline.js";
import {
  taskSchema,
  taskDetailSchema,
} from "../shared/rote/workflow-output.js";
export default defineAction({
  description:
    "Read task status, immutable pipeline versions and run metrics. Reference rows are never returned.",
  schema: z.object({ id: z.string().uuid() }),
  outputSchema: taskDetailSchema,
  errors,
  mcpTool: true,
  http: { method: "GET" },
  run: (a, ctx) => guarded(() => getTask(a.id, scopeFor(ctx))),
});
