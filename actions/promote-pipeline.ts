import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { promotePipeline } from "../server/rote/workflow.js";
import { bindingsSchema, toleranceSchema } from "../shared/rote/pipeline.js";
import {
  taskSchema,
  taskDetailSchema,
} from "../shared/rote/workflow-output.js";
export default defineAction({
  description:
    "Human approval activates this exact verified pipeline hash. Promotion is audited by the framework.",
  schema: z.object({
    id: z.string().uuid(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  outputSchema: z.object({ id: z.string(), status: z.literal("approved") }),
  errors,
  needsApproval: true,
  run: (a, ctx) => guarded(() => promotePipeline(a.id, a.hash, scopeFor(ctx))),
});
