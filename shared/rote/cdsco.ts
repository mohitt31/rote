// Real public data task: India CDSCO "Not of Standard Quality" (NSQ) monthly
// drug alerts. Three months (Jan–Mar 2026) are bundled exactly as published
// by cdscoonline.gov.in with their fetch URL, time and SHA-256.
//
// The job a pharmacy buyer repeats every month: turn the raw alert list into
// a clean table with the manufacturer's name (not its full address), the test
// the sample failed, the expiry month as a date and a consistent reporting
// source. `CDSCO_STEPS` is the recorded step sequence; `cdscoReference` is an
// independent plain-code implementation of the same written rules, used only
// to produce reference outputs for a person to review.
import raw from "./cdsco-nsq-2026.json";
import type { Row, Table } from "./model.js";

export type CdscoMonth = {
  month: string;
  url: string;
  sha256: string;
  fetchedAt: string;
  rows: Record<string, string>[];
};
export const CDSCO_SOURCE: string = raw.source;
export const CDSCO_MONTHS = raw.months as CdscoMonth[];

export const CDSCO_COLUMNS = [
  "str_product_name",
  "str_batch_no",
  "dt_manufacturing_date",
  "dt_expiry_date",
  "str_manufactured_by",
  "str_nsq_result",
  "str_reporting_source",
  "str_reported_by_lab_or_state",
  "dt_reporting_month_year",
  "str_brand_name",
];

/** One CDSCO month as an import table, values exactly as published. */
export function cdscoTable(month: CdscoMonth): Table {
  return {
    columns: CDSCO_COLUMNS,
    rows: month.rows.map((r) =>
      Object.fromEntries(CDSCO_COLUMNS.map((c) => [c, r[c] ?? null])),
    ),
  };
}

// Written rules. The first test named in the result text decides the
// category; anything not listed stays "Other (review)" for a person.
export const FAILED_TEST_PATTERN =
  "(?i)\\b(assay|dissolution|sterility|descripti\\w*|identification|particulate|disintegration|uniformity|microbi\\w*|viable count|fungal count|endotoxins?|bet|ph|clarity|loss on drying|water|heavy metals|ethylene glycol|weight|label|misbrand\\w*|spurious)\\b";
export const FAILED_TEST_LABELS: { from: string | null; to: string }[] = [
  { from: "assay", to: "Assay" },
  { from: "dissolution", to: "Dissolution" },
  { from: "sterility", to: "Sterility" },
  { from: "descriptive", to: "Description" },
  { from: "description", to: "Description" },
  { from: "descriptions", to: "Description" },
  { from: "identification", to: "Identification" },
  { from: "particulate", to: "Particulate matter" },
  { from: "disintegration", to: "Disintegration" },
  { from: "uniformity", to: "Uniformity" },
  { from: "microbiological", to: "Microbial contamination" },
  { from: "microbial", to: "Microbial contamination" },
  { from: "viable count", to: "Microbial contamination" },
  { from: "fungal count", to: "Microbial contamination" },
  { from: "endotoxins", to: "Bacterial endotoxins" },
  { from: "endotoxin", to: "Bacterial endotoxins" },
  { from: "bet", to: "Bacterial endotoxins" },
  { from: "ph", to: "pH" },
  { from: "clarity", to: "Clarity" },
  { from: "loss on drying", to: "Loss on drying" },
  { from: "water", to: "Water content" },
  { from: "heavy metals", to: "Heavy metals" },
  { from: "ethylene glycol", to: "Ethylene glycol" },
  { from: "weight", to: "Weight" },
  { from: "label", to: "Labelling" },
  { from: "misbranded", to: "Misbranded" },
  { from: "misbrandad", to: "Misbranded" },
  { from: "spurious", to: "Spurious" },
  { from: null, to: "Other (review)" },
];
const SOURCE_LABELS = [
  { from: "State lab", to: "State Lab" },
  { from: "CDSCO labs", to: "CDSCO Labs" },
];
export const CDSCO_OUTPUT_COLUMNS = [
  "batch_no",
  "product",
  "manufacturer",
  "failed_test",
  "expiry",
  "reporting_source",
  "reported_by",
];

/** Recorded step sequence for one month (input binding name: `nsq`). */
export const CDSCO_STEPS = [
  {
    action: "normalize_text",
    params: {
      columns: [
        "str_product_name",
        "str_batch_no",
        "str_manufactured_by",
        "str_nsq_result",
        "str_reporting_source",
        "str_reported_by_lab_or_state",
      ],
    },
  },
  {
    action: "regex_extract",
    params: {
      column: "str_manufactured_by",
      pattern: "^[^,]+",
      newColumn: "manufacturer",
    },
  },
  { action: "normalize_text", params: { columns: ["manufacturer"] } },
  {
    action: "regex_extract",
    params: {
      column: "str_nsq_result",
      pattern: FAILED_TEST_PATTERN,
      group: 1,
      newColumn: "failed_test",
    },
  },
  {
    action: "normalize_text",
    params: { columns: ["failed_test"], case: "lower" },
  },
  {
    action: "map_values",
    params: {
      column: "failed_test",
      entries: FAILED_TEST_LABELS,
      unmatched: "error",
    },
  },
  {
    action: "map_values",
    params: {
      column: "str_reporting_source",
      entries: SOURCE_LABELS,
      unmatched: "keep",
    },
  },
  {
    action: "parse_date",
    params: {
      column: "dt_expiry_date",
      formats: ["MMM-yyyy"],
      timezone: "UTC",
      newColumn: "expiry",
    },
  },
  {
    action: "rename_columns",
    params: {
      mapping: {
        str_batch_no: "batch_no",
        str_product_name: "product",
        str_reporting_source: "reporting_source",
        str_reported_by_lab_or_state: "reported_by",
      },
    },
  },
  { action: "select_columns", params: { columns: CDSCO_OUTPUT_COLUMNS } },
  {
    action: "validate",
    params: {
      nonNull: ["batch_no", "product", "manufacturer", "failed_test", "expiry"],
      rowCount: { min: 1, max: 100000 },
    },
  },
] as const;

// ---- Independent reference: plain code, no step engine. ----
const clean = (v: string | null | undefined) =>
  v === null || v === undefined
    ? null
    : v.normalize("NFKC").trim().replace(/\s+/gu, " ");
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
function monthStart(v: string | null) {
  const m = v ? /^([A-Za-z]{3})-(\d{4})$/.exec(v.trim()) : null;
  const i = m ? MONTHS.findIndex((x) => x.toLowerCase() === m[1]!.toLowerCase()) : -1;
  if (!m || i < 0) throw Error(`Unparseable month: ${v}`);
  return new Date(Date.UTC(Number(m[2]), i, 1)).toISOString();
}
const failedTestRe = new RegExp(FAILED_TEST_PATTERN.replace("(?i)", ""), "i");
const labels = new Map(FAILED_TEST_LABELS.map((e) => [e.from, e.to]));
const sources = new Map(SOURCE_LABELS.map((e) => [e.from, e.to]));

export function cdscoReference(month: CdscoMonth): Table {
  const rows: Row[] = month.rows.map((r) => {
    const maker = clean(r.str_manufactured_by);
    const found = failedTestRe.exec(clean(r.str_nsq_result) ?? "");
    const key = found ? found[1]!.toLowerCase() : null;
    if (!labels.has(key)) throw Error(`No label for failed test: ${key}`);
    const source = clean(r.str_reporting_source);
    return {
      batch_no: clean(r.str_batch_no),
      product: clean(r.str_product_name),
      manufacturer: clean(maker ? (/^[^,]+/.exec(maker)?.[0] ?? null) : null),
      failed_test: labels.get(key)!,
      expiry: monthStart(r.dt_expiry_date ?? null),
      reporting_source: (source && sources.get(source)) ?? source,
      reported_by: clean(r.str_reported_by_lab_or_state),
    };
  });
  return { columns: CDSCO_OUTPUT_COLUMNS, rows };
}
