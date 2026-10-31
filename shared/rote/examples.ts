import type { StepName } from "./model.js";
export const stepExamples: Record<StepName, unknown> = {
  select_columns: { columns: ["payout_id", "net"] },
  rename_columns: { mapping: { payout_id: "reference" } },
  parse_date: { column: "date", formats: ["yyyy-MM-dd"], timezone: "UTC" },
  parse_number: { column: "net", currency: "", decimal: ".", thousands: "," },
  normalize_text: { columns: ["Vendor"], case: "lower" },
  regex_extract: {
    column: "description",
    pattern: "Stripe (.*)",
    group: 1,
    newColumn: "kind",
  },
  map_values: { column: "Unit", entries: [{ from: "EA", to: "each" }] },
  filter_rows: { predicates: [{ column: "status", op: "eq", value: "paid" }] },
  dedupe: { keys: ["payout_id"], keep: "first" },
  join: {
    rightTableId: "select-an-imported-bank-table-id",
    keys: [{ left: "payout_id", right: "reference" }],
    type: "left",
  },
  group_aggregate: {
    keys: ["status"],
    aggregates: [{ op: "sum", column: "net", newColumn: "total" }],
  },
  sort: { by: [{ column: "payout_id", direction: "asc" }] },
  compute_column: { newColumn: "double_net", formula: "[net] * 2" },
  split_column: {
    column: "payout_id",
    separator: "_",
    newColumns: ["prefix", "week", "number"],
  },
  validate: {
    nonNull: ["payout_id"],
    unique: [["payout_id"]],
    rowCount: { min: 1, max: 100000 },
  },
};
