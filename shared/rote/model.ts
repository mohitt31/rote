import { z } from "zod";
export const cellSchema = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export type Cell = z.infer<typeof cellSchema>;
export type Row = Record<string, Cell>;
export type Table = { columns: string[]; rows: Row[] };
export const column = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (s) => !["__proto__", "prototype", "constructor"].includes(s),
    "Reserved column name",
  );
const columns = z.array(column).min(1).max(100);
const pair = z.object({ left: column, right: column }).strict();
const predicate = z
  .object({
    column,
    op: z.enum([
      "eq",
      "ne",
      "gt",
      "gte",
      "lt",
      "lte",
      "contains",
      "is_null",
      "not_null",
    ]),
    value: cellSchema.optional(),
  })
  .strict();
export const stepSchemas = {
  select_columns: z.object({ columns }).strict(),
  rename_columns: z.object({ mapping: z.record(column, column) }).strict(),
  parse_date: z
    .object({
      column,
      formats: z.array(z.string().min(1).max(64)).min(1).max(10),
      timezone: z.string().default("UTC"),
      newColumn: column.optional(),
    })
    .strict(),
  parse_number: z
    .object({
      column,
      decimal: z.enum([".", ","]).default("."),
      thousands: z.enum([",", ".", " ", ""]).default(","),
      currency: z.string().max(10).default(""),
      newColumn: column.optional(),
    })
    .strict(),
  normalize_text: z
    .object({
      columns,
      case: z.enum(["preserve", "lower", "upper"]).default("preserve"),
      trim: z.boolean().default(true),
      collapseSpaces: z.boolean().default(true),
      unicode: z.enum(["NFC", "NFKC"]).default("NFKC"),
    })
    .strict(),
  regex_extract: z
    .object({
      column,
      pattern: z.string().min(1).max(256),
      group: z.number().int().min(0).max(20).default(0),
      newColumn: column,
    })
    .strict(),
  map_values: z
    .object({
      column,
      entries: z
        .array(z.object({ from: cellSchema, to: cellSchema }).strict())
        .max(1000),
      unmatched: z.enum(["keep", "null", "error"]).default("keep"),
      newColumn: column.optional(),
    })
    .strict(),
  filter_rows: z
    .object({
      mode: z.enum(["all", "any"]).default("all"),
      predicates: z.array(predicate).min(1).max(20),
    })
    .strict(),
  dedupe: z
    .object({ keys: columns, keep: z.enum(["first", "last"]).default("first") })
    .strict(),
  join: z
    .object({
      rightTableId: z.string().min(1),
      keys: z.array(pair).min(1).max(10),
      type: z.enum(["left", "inner"]).default("left"),
      suffix: z.string().min(1).max(16).default("_right"),
      amount: z
        .object({
          left: column,
          right: column,
          tolerance: z.number().finite().nonnegative(),
        })
        .strict()
        .optional(),
      date: z
        .object({
          left: column,
          right: column,
          windowDays: z.number().int().min(0).max(365),
        })
        .strict()
        .optional(),
    })
    .strict(),
  group_aggregate: z
    .object({
      keys: z.array(column).max(20),
      aggregates: z
        .array(
          z
            .object({
              op: z.enum(["sum", "count", "min", "max", "avg"]),
              column: column.optional(),
              newColumn: column,
            })
            .strict(),
        )
        .min(1)
        .max(30),
    })
    .strict(),
  sort: z
    .object({
      by: z
        .array(
          z
            .object({
              column,
              direction: z.enum(["asc", "desc"]).default("asc"),
            })
            .strict(),
        )
        .min(1)
        .max(20),
    })
    .strict(),
  compute_column: z
    .object({ newColumn: column, formula: z.string().min(1).max(500) })
    .strict(),
  split_column: z
    .object({
      column,
      separator: z.string().min(1).max(20),
      newColumns: columns,
    })
    .strict(),
  validate: z
    .object({
      schema: z
        .record(column, z.enum(["string", "number", "boolean"]))
        .optional(),
      nonNull: z.array(column).default([]),
      unique: z.array(z.array(column).min(1)).default([]),
      sumEquals: z
        .array(
          z
            .object({
              column,
              value: z.number().finite(),
              tolerance: z.number().finite().nonnegative().default(0),
            })
            .strict(),
        )
        .default([]),
      rowCount: z
        .object({
          min: z.number().int().nonnegative(),
          max: z.number().int().nonnegative(),
        })
        .strict()
        .optional(),
    })
    .strict(),
};
export type StepName = keyof typeof stepSchemas;
export const stepNames = Object.keys(stepSchemas) as StepName[];
export const summarySchema = z.object({
  outputTableId: z.string(),
  rowCount: z.number().int(),
  columns: z.array(z.string()),
  fingerprint: z.string(),
});
export function checkTable(t: Table): Table {
  columns.parse(t.columns);
  if (new Set(t.columns).size !== t.columns.length)
    throw Error("Duplicate columns");
  if (t.rows.length > 100000) throw Error("Table exceeds 100,000 rows");
  for (const row of t.rows) {
    if (
      Object.keys(row).length !== t.columns.length ||
      t.columns.some((c) => !Object.prototype.hasOwnProperty.call(row, c))
    )
      throw Error("Row does not match columns");
    for (const c of t.columns) cellSchema.parse(row[c]);
  }
  return t;
}

export function cell(row: Row, c: string): Cell {
  const v = row[c];
  if (v === undefined) throw Error(`Missing column value: ${c}`);
  return v;
}
