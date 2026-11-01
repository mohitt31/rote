import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { errors, guarded, scopeFor } from "../server/rote/action-helpers.js";
import { maybeResetDemo } from "../server/rote/demo.js";
import { getOverview } from "../server/rote/workflow.js";
export default defineAction({
  description:
    "Summarize the caller's recurring tasks: active version, recorded replays, drift stops, median replay time and model tokens. Numbers come only from recorded runs.",
  schema: z.object({}),
  outputSchema: z.object({
    tasks: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        activeVersion: z.number().nullable(),
        replays: z.number(),
        driftStops: z.number(),
        medianReplayMs: z.number().nullable(),
        replayTokens: z.number(),
        agentTeachTokens: z.number().nullable(),
        lastRunAt: z.date().nullable(),
      }),
    ),
  }),
  errors,
  readOnly: true,
  http: { method: "GET" },
  run: (_, ctx) =>
    guarded(async () => {
      await maybeResetDemo(scopeFor(ctx));
      return getOverview(scopeFor(ctx));
    }),
});
