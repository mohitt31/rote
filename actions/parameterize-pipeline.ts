import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { parameterizePipeline } from "../server/rote/workflow.js";
import { parameterEditsSchema } from "../shared/rote/pipeline.js";
export default defineAction({
  description:
    'Generalize existing scalar step values into named typed parameters in a new unverified version. A small agent may propose mappings; reference data and checks cannot be edited. Path is relative to step params, e.g. ["currency"].',
  schema: z.object({ id: z.string().uuid(), edits: parameterEditsSchema }),
  outputSchema: z.object({
    id: z.string(),
    version: z.number(),
    hash: z.string(),
  }),
  errors,
  run: (a, ctx) =>
    guarded(() => parameterizePipeline(a.id, a.edits, scopeFor(ctx))),
});
