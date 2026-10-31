import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { execute, errors } from "../server/rote/action-helpers.js";
import { stepSchemas, summarySchema } from "../shared/rote/model.js";
export default defineAction({
  description:
    "Parse currency and explicit number separators; persists a new immutable output table and logs the step.",
  schema: z.object({
    inputTableId: z.string().min(1).describe("Input table ID"),
    params: stepSchemas.parse_number.describe("Structured step parameters"),
  }),
  outputSchema: summarySchema,
  errors,
  link: ({ result }) => ({
    url: "/workbench?table=" + encodeURIComponent(result.outputTableId),
    label: "Open output table",
  }),
  run: (args, ctx) =>
    execute("parse_number", args.inputTableId, args.params, ctx),
});
