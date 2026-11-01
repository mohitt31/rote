import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { scopeFor, guarded, errors } from "../server/rote/action-helpers.js";
import { RoteError } from "../server/rote/repository.js";
import { scoped } from "../server/rote/workflow.js";
export default defineAction({
  description:
    "Show bounded verification row differences to the signed-in human in the app. Reference rows are not exposed as an agent tool.",
  schema: z.object({ id: z.string().uuid() }),
  outputSchema: z.object({ diffs: z.array(z.unknown()) }),
  uiOnly: true,
  agentTool: false,
  mcpTool: false,
  readOnly: true,
  http: { method: "GET" },
  errors,
  run: ({ id }, ctx) =>
    guarded(async () => {
      const [v] = await getDb()
        .select()
        .from(schema.verifications)
        .where(
          and(
            eq(schema.verifications.id, id),
            scoped(schema.verifications, scopeFor(ctx)),
          ),
        )
        .limit(1);
      if (!v) throw new RoteError("Verification not found");
      return { diffs: z.array(z.unknown()).parse(v.rowDiff) };
    }),
});
