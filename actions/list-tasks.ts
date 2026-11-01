import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { listTasks } from "../server/rote/workflow.js";
import { bindingsSchema, toleranceSchema } from "../shared/rote/pipeline.js";
import {
  taskSchema,
  taskDetailSchema,
} from "../shared/rote/workflow-output.js";
export default defineAction({
  description: "List your recurring tasks.",
  schema: z.object({}),
  outputSchema: z.array(taskSchema),
  errors,
  http: { method: "GET" },
  run: (a, ctx) => guarded(() => listTasks(scopeFor(ctx))),
});
