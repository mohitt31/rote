import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { execute, errors } from "../server/rote/action-helpers.js";
import { stepSchemas, summarySchema } from "../shared/rote/model.js";
export default defineAction({
  description:
    "Select ordered columns; persists a new immutable output table and logs the step.",
  schema: z.object({
    inputTableId: z.string().min(1).describe("Input table ID"),
    params: stepSchemas.select_columns.describe("Structured step parameters"),
  }),
  outputSchema: summarySchema,
  errors,
  link: ({ result }) => ({
    url: "/workbench?table=" + encodeURIComponent(result.outputTableId),
    label: "Open output table",
  }),
  run: (args, ctx) =>
    execute("select_columns", args.inputTableId, args.params, ctx),
});
