import { z } from "zod";

import { stepNames } from "./model.js";
export const bindingsSchema = z
  .record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), z.string().uuid())
  .refine(
    (v) => Object.keys(v).length > 0 && Object.keys(v).length <= 10,
    "Supply 1–10 named inputs",
  );
export const planSchema = z
  .object({
    inputs: z.array(z.string()).min(1).max(10),
    fingerprints: z.record(z.string(), z.string()),
    steps: z
      .array(
        z
          .object({
            action: z.enum(stepNames),
            input: z.string(),
            right: z.string().optional(),
            params: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    output: z.string(),
    parameters: z
      .record(
        z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
        z
          .object({
            type: z.enum(["string", "number", "boolean"]),
            default: z.union([
              z.string().max(10000),
              z.number().finite(),
              z.boolean(),
            ]),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export const toleranceSchema = z
  .record(z.string(), z.number().finite().nonnegative())
  .default({});

export const parameterValuesSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    z.union([z.string().max(10000), z.number().finite(), z.boolean()]),
  )
  .default({});
export const parameterEditsSchema = z
  .array(
    z
      .object({
        step: z.number().int().min(0).max(99),
        path: z
          .array(z.union([z.string().min(1), z.number().int().nonnegative()]))
          .min(1)
          .max(10),
        name: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
      })
      .strict(),
  )
  .min(1)
  .max(30);
