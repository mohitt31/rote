import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { prepareCdscoTask } from "../server/rote/cdsco-sample.js";
import { bindingsSchema } from "../shared/rote/pipeline.js";
const example = z.object({
  inputs: bindingsSchema,
  outputTableId: z.string().nullable(),
  sourceOutputTableId: z.string().nullable(),
});
export default defineAction({
  description:
    "Prepare the real-data task: India CDSCO 'Not of Standard Quality' drug alerts for Jan, Feb and Mar 2026 (bundled as published, with source URL and SHA-256). January's steps are recorded without a model; January and February get reference outputs from an independent implementation for human review; March is the unseen next month. Grants no approval and creates no active pipeline.",
  schema: z.object({}),
  outputSchema: z.object({
    taskId: z.string(),
    training: example,
    holdout: example,
    next: example,
  }),
  errors,
  run: (_, ctx) => guarded(() => prepareCdscoTask(scopeFor(ctx))),
});
