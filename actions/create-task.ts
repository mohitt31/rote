import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { createTask } from "../server/rote/workflow.js";
import { bindingsSchema, toleranceSchema } from "../shared/rote/pipeline.js";
import {
  taskSchema,
  taskDetailSchema,
} from "../shared/rote/workflow-output.js";
export default defineAction({
  description: "Create a recurring task with immutable numeric tolerances.",
  schema: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).default(""),
    tolerances: toleranceSchema,
  }),
  outputSchema: z.object({ id: z.string() }),
  errors,
  run: (a, ctx) =>
    guarded(() =>
      createTask(a.name, a.description, a.tolerances, scopeFor(ctx)),
    ),
});
