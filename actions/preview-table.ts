import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { scopeFor, guarded, errors } from "../server/rote/action-helpers.js";
import { readTable } from "../server/rote/repository.js";
import { cellSchema } from "../shared/rote/model.js";
export default defineAction({
  description:
    "Read a bounded preview of an owned table; at most 100 rows. Null and empty text remain distinct.",
  schema: z.object({
    inputTableId: z.string().min(1),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), cellSchema)),
    rowCount: z.number(),
    sample: z.boolean(),
    fingerprint: z.string(),
  }),
  errors,
  http: { method: "GET" },
  run: ({ inputTableId, offset, limit }, ctx) =>
    guarded(async () => {
      const t = await readTable(inputTableId, scopeFor(ctx));
      return {
        id: t.id,
        name: t.name,
        columns: t.columns,
        rows: t.rows.slice(offset, offset + limit),
        rowCount: t.rowCount,
        sample: t.sample,
        fingerprint: t.fingerprint,
      };
    }),
});
