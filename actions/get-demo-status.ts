import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { demoStatus } from "../server/rote/demo.js";
export default defineAction({
  description:
    "Whether this deployment is the public demo (shared sample data reset hourly; the agent is either off or capped per hour) and when the next reset is due.",
  schema: z.object({}),
  outputSchema: z.object({
    publicDemo: z.boolean(),
    nextResetAt: z.string().nullable(),
    agent: z
      .object({ turnsLeft: z.number(), turnsPerHour: z.number() })
      .nullable(),
  }),
  errors,
  readOnly: true,
  agentTool: false,
  http: { method: "GET" },
  run: (_, ctx) => guarded(() => demoStatus(scopeFor(ctx))),
});
