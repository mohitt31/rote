import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { scopeFor, guarded, errors } from "../server/rote/action-helpers.js";
import { listTables } from "../server/rote/repository.js";
export default defineAction({
  description:
    "List the latest 100 tables owned by the caller in the active workspace, without raw rows.",
  schema: z.object({}),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      rowCount: z.number(),
      columns: z.array(z.string()),
      sample: z.boolean(),
    }),
  ),
  errors,
  mcpTool: true,
  http: { method: "GET" },
  run: (_, ctx) => guarded(() => listTables(scopeFor(ctx))),
});
