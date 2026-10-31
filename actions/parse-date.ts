import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { execute, errors } from "../server/rote/action-helpers.js";
import { stepSchemas, summarySchema } from "../shared/rote/model.js";
export default defineAction({
  description:
    "Parse declared date formats and timezone to UTC ISO; persists a new immutable output table and logs the step.",
  schema: z.object({
    inputTableId: z.string().min(1).describe("Input table ID"),
    params: stepSchemas.parse_date.describe("Structured step parameters"),
  }),
  outputSchema: summarySchema,
  errors,
  link: ({ result }) => ({
    url: "/workbench?table=" + encodeURIComponent(result.outputTableId),
    label: "Open output table",
  }),
  run: (args, ctx) =>
    execute("parse_date", args.inputTableId, args.params, ctx),
});
