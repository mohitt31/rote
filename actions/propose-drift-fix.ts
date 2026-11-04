import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { assertReadable } from "../server/rote/holdout-guard.js";
import { proposeDriftFix } from "../server/rote/repair.js";
import { bindingsSchema } from "../shared/rote/pipeline.js";

const change = z.union([
  z.object({
    kind: z.literal("rename"),
    input: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  z.object({
    kind: z.literal("date_format"),
    input: z.string(),
    column: z.string(),
    from: z.array(z.string()),
    to: z.string(),
  }),
]);
export default defineAction({
  description:
    "After a run stops on drift, explain the changed input format without a model (renamed columns, changed date format) and re-run the recorded steps on that week. Returns the proposed changes and a new recorded output for a person to review; it approves and promotes nothing. Value changes and anything else are reported as unsupported.",
  schema: z.object({
    taskId: z.string().uuid(),
    inputs: bindingsSchema,
  }),
  outputSchema: z.union([
    z.object({
      status: z.literal("proposed"),
      changes: z.array(change),
      sourceOutputTableId: z.string(),
      rowCount: z.number(),
      columns: z.array(z.string()),
      modelCalls: z.literal(0),
      durationMs: z.number(),
    }),
    z.object({
      status: z.enum(["unsupported", "no_drift"]),
      reason: z.string(),
      modelCalls: z.literal(0),
      durationMs: z.number(),
    }),
  ]),
  errors,
  run: (a, ctx) =>
    guarded(async () => {
      const scope = scopeFor(ctx);
      await assertReadable(Object.values(a.inputs), scope, ctx);
      return proposeDriftFix(a.taskId, a.inputs, scope);
    }),
});
