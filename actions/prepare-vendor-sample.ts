import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { prepareVendorSample } from "../server/rote/vendor-sample.js";
import { bindingsSchema } from "../shared/rote/pipeline.js";
const example = z.object({
  inputs: bindingsSchema,
  outputTableId: z.string().nullable(),
  sourceOutputTableId: z.string().nullable(),
});
export default defineAction({
  description:
    "Prepare a synthetic three-week vendor price-list cleanup demo with reference outputs for human review. Uses no model, grants no approval, and creates no active pipeline.",
  schema: z.object({}),
  outputSchema: z.object({
    taskId: z.string(),
    training: example,
    holdout: example,
    next: example,
  }),
  errors,
  run: (_, ctx) => guarded(() => prepareVendorSample(scopeFor(ctx))),
});
