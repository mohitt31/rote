import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { demoStatus } from "../server/rote/demo.js";
export default defineAction({
  description:
    "Whether this deployment is the public demo (agent off, shared data reset hourly) and when the next reset is due.",
  schema: z.object({}),
  outputSchema: z.object({
    publicDemo: z.boolean(),
    nextResetAt: z.string().nullable(),
  }),
  errors,
  readOnly: true,
  agentTool: false,
  http: { method: "GET" },
  run: (_, ctx) => guarded(() => demoStatus(scopeFor(ctx))),
});
