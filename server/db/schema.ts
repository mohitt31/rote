import {
  pgTable,
  type AnyPgColumn,
  text,
  jsonb,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

import type { Table } from "../../shared/rote/model.js";
export const workspaces = pgTable("rote_workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const files = pgTable("rote_files", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  attachmentRef: text("attachment_ref"),
  sha256: text("sha256").notNull(),
  sample: boolean("sample").notNull().default(false),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const tables = pgTable(
  "rote_tables",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    columns: jsonb("columns").$type<string[]>().notNull(),
    rows: jsonb("rows").$type<Table["rows"]>().notNull(),
    columnSchema: jsonb("column_schema").notNull(),
    fingerprint: text("fingerprint").notNull(),
    rowCount: integer("row_count").notNull(),
    fileId: text("file_id").references(() => files.id),
    sample: boolean("sample").notNull().default(false),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("rote_tables_owner_org_idx").on(t.ownerEmail, t.orgId)],
);
export const tasks = pgTable("rote_tasks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  currentPipelineId: text("current_pipeline_id"),
  tolerances: jsonb("tolerances")
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const runs = pgTable("rote_runs", {
  id: text("id").primaryKey(),
  taskId: text("task_id").references(() => tasks.id),
  mode: text("mode").notNull(),
  pipelineId: text("pipeline_id").references((): AnyPgColumn => pipelines.id),
  traceRunId: text("trace_run_id"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  cost: doublePrecision("cost"),
  durationMs: doublePrecision("duration_ms"),
  status: text("status").notNull(),
  inputFingerprint: text("input_fingerprint"),
  outputTableId: text("output_table_id").references(() => tables.id),
  approvedBy: text("approved_by"),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const goldenExamples = pgTable("rote_golden_examples", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id),
  inputBindings: jsonb("input_bindings")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  sourceOutputTableId: text("source_output_table_id").references(
    () => tables.id,
  ),
  inputFileIds: jsonb("input_file_ids").$type<string[]>().notNull(),
  outputTableId: text("output_table_id")
    .notNull()
    .references(() => tables.id),
  holdout: boolean("holdout").notNull().default(false),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const pipelines = pgTable("rote_pipelines", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id),
  version: integer("version").notNull(),
  steps: jsonb("steps").notNull(),
  paramsSchema: jsonb("params_schema").notNull(),
  status: text("status").notNull(),
  createdFromRunId: text("created_from_run_id").references(() => runs.id),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const verifications = pgTable("rote_verifications", {
  id: text("id").primaryKey(),
  pipelineId: text("pipeline_id")
    .notNull()
    .references(() => pipelines.id),
  checkValidationResult: jsonb("check_validation_result").notNull(),
  exampleResults: jsonb("example_results").notNull(),
  rowDiff: jsonb("row_diff").notNull(),
  attempts: jsonb("attempts").notNull(),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const stepLog = pgTable(
  "rote_step_log",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    inputTableId: text("input_table_id")
      .notNull()
      .references(() => tables.id),
    outputTableId: text("output_table_id")
      .notNull()
      .references(() => tables.id),
    params: jsonb("params").notNull(),
    traceRunId: text("trace_run_id"),
    durationMs: doublePrecision("duration_ms").notNull(),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("rote_steps_input_idx").on(t.inputTableId)],
);
