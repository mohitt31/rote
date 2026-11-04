import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { restraintReport } from "../server/rote/restraint.js";
export default defineAction({
  description:
    "Restraint report: group the caller's agent runs that called Rote step actions by the steps they used, with token, cost and time totals from completed framework traces, and show which groups an approved pipeline already covers. Use it to suggest which repeated agent job to crystallize next. Numbers come only from recorded runs.",
  schema: z.object({}),
  outputSchema: z.object({
    groups: z.array(
      z.object({
        signature: z.string(),
        steps: z.number(),
        actions: z.record(z.string(), z.number()),
        agentRuns: z.number(),
        tracedRuns: z.number(),
        tokensIn: z.number(),
        tokensOut: z.number(),
        costUsd: z.number(),
        agentMs: z.number(),
        coveredBy: z.array(
          z.object({
            taskId: z.string(),
            taskName: z.string(),
            version: z.number(),
          }),
        ),
      }),
    ),
    note: z.string(),
  }),
  errors,
  readOnly: true,
  http: { method: "GET" },
  run: (_, ctx) => guarded(() => restraintReport(scopeFor(ctx))),
});
