import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { execute, errors } from "../server/rote/action-helpers.js";
import { stepSchemas, summarySchema } from "../shared/rote/model.js";
export default defineAction({
  description:
    "Sort rows stably by ordered keys; persists a new immutable output table and logs the step.",
  schema: z.object({
    inputTableId: z.string().min(1).describe("Input table ID"),
    params: stepSchemas.sort.describe("Structured step parameters"),
  }),
  outputSchema: summarySchema,
  errors,
  link: ({ result }) => ({
    url: "/workbench?table=" + encodeURIComponent(result.outputTableId),
    label: "Open output table",
  }),
  run: (args, ctx) => execute("sort", args.inputTableId, args.params, ctx),
});
