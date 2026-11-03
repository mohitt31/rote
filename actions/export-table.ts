import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { scopeFor, guarded, errors } from "../server/rote/action-helpers.js";
import { assertReadable } from "../server/rote/holdout-guard.js";
import { readTable } from "../server/rote/repository.js";
export default defineAction({
  description:
    "Prepare a session-authenticated CSV download for an owned table. Spreadsheet formula prefixes are escaped. Does not send rows through agent traces.",
  schema: z.object({ inputTableId: z.string().min(1) }),
  outputSchema: z.object({ downloadUrl: z.string(), rowCount: z.number() }),
  errors,
  http: { method: "GET" },
  run: ({ inputTableId }, ctx) =>
    guarded(async () => {
      await assertReadable([inputTableId], scopeFor(ctx), ctx);
      const t = await readTable(inputTableId, scopeFor(ctx));
      return {
        downloadUrl: "/rote-export?table=" + encodeURIComponent(t.id),
        rowCount: t.rowCount,
      };
    }),
});
