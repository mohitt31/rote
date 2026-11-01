import { z } from "zod";

import { planSchema } from "./pipeline.js";
export const taskSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  currentPipelineId: z.string().nullable(),
  tolerances: z.record(z.string(), z.number()),
  ownerEmail: z.string(),
  orgId: z.string().nullable(),
  createdAt: z.date(),
});
export const runSchema = z.object({
  id: z.string(),
  mode: z.string(),
  status: z.string(),
  outputTableId: z.string().nullable(),
  tokensIn: z.number().nullable(),
  tokensOut: z.number().nullable(),
  cost: z.number().nullable(),
  durationMs: z.number().nullable(),
});
export const taskDetailSchema = z.object({
  task: taskSchema,
  examples: z.array(z.object({ id: z.string(), holdout: z.boolean() })),
  versions: z.array(
    z.object({
      id: z.string(),
      version: z.number(),
      status: z.string(),
      hash: z.string(),
      plan: planSchema,
      verification: z
        .object({ id: z.string(), check: z.unknown(), results: z.unknown() })
        .nullable(),
    }),
  ),
  runs: z.array(runSchema),
});
