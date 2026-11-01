import { pipelineLifecycle, runLifecycle } from "../rote/lifecycle.js";
// Additive, named migrations. Never edit an entry after it has been applied.
const identity =
  "owner_email TEXT NOT NULL, org_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP";
export const migrations = [
  {
    version: 1,
    name: "rote_initial_domain_tables",
    sql: `
CREATE TABLE rote_workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, ${identity});
CREATE TABLE rote_files (id TEXT PRIMARY KEY, name TEXT NOT NULL, attachment_ref TEXT, sha256 TEXT NOT NULL, sample BOOLEAN NOT NULL DEFAULT false, ${identity});
CREATE TABLE rote_tables (id TEXT PRIMARY KEY, name TEXT NOT NULL, columns JSONB NOT NULL, rows JSONB NOT NULL, column_schema JSONB NOT NULL, fingerprint TEXT NOT NULL, row_count INTEGER NOT NULL CHECK(row_count >= 0), file_id TEXT REFERENCES rote_files(id), sample BOOLEAN NOT NULL DEFAULT false, ${identity});
CREATE INDEX rote_tables_owner_org_idx ON rote_tables(owner_email,org_id);
CREATE TABLE rote_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, current_pipeline_id TEXT, ${identity});
CREATE TABLE rote_runs (id TEXT PRIMARY KEY, task_id TEXT REFERENCES rote_tasks(id), mode TEXT NOT NULL CHECK(mode IN ('agent','pipeline')), trace_run_id TEXT, tokens_in INTEGER, tokens_out INTEGER, cost DOUBLE PRECISION, duration_ms DOUBLE PRECISION, status TEXT NOT NULL CHECK(status IN (${runLifecycle.states.map((s) => `'${s}'`).join(",")})), input_fingerprint TEXT, output_table_id TEXT REFERENCES rote_tables(id), approved_by TEXT, ${identity});
CREATE TABLE rote_golden_examples (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES rote_tasks(id), input_file_ids JSONB NOT NULL, output_table_id TEXT NOT NULL REFERENCES rote_tables(id), holdout BOOLEAN NOT NULL DEFAULT false, ${identity});
CREATE TABLE rote_pipelines (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES rote_tasks(id), version INTEGER NOT NULL CHECK(version > 0), steps JSONB NOT NULL, params_schema JSONB NOT NULL, status TEXT NOT NULL CHECK(status IN (${pipelineLifecycle.states.map((s) => `'${s}'`).join(",")})), created_from_run_id TEXT REFERENCES rote_runs(id), ${identity}, UNIQUE(task_id,version));
ALTER TABLE rote_tasks ADD CONSTRAINT rote_tasks_pipeline_fk FOREIGN KEY(current_pipeline_id) REFERENCES rote_pipelines(id);
CREATE TABLE rote_verifications (id TEXT PRIMARY KEY, pipeline_id TEXT NOT NULL REFERENCES rote_pipelines(id), check_validation_result JSONB NOT NULL, example_results JSONB NOT NULL, row_diff JSONB NOT NULL, attempts JSONB NOT NULL, ${identity});
CREATE TABLE rote_step_log (id TEXT PRIMARY KEY, action TEXT NOT NULL, input_table_id TEXT NOT NULL REFERENCES rote_tables(id), output_table_id TEXT NOT NULL REFERENCES rote_tables(id), params JSONB NOT NULL, trace_run_id TEXT, duration_ms DOUBLE PRECISION NOT NULL, ${identity});
CREATE INDEX rote_steps_input_idx ON rote_step_log(input_table_id);
`,
  },
  {
    version: 2,
    name: "rote_pipeline_input_bindings",
    sql: `
ALTER TABLE rote_tasks ADD COLUMN tolerances JSONB NOT NULL DEFAULT '{}';
ALTER TABLE rote_golden_examples ADD COLUMN input_bindings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE rote_golden_examples ADD COLUMN source_output_table_id TEXT REFERENCES rote_tables(id);
ALTER TABLE rote_runs DROP CONSTRAINT rote_runs_mode_check;
ALTER TABLE rote_runs ADD CONSTRAINT rote_runs_mode_check CHECK(mode IN ('agent','pipeline','manual'));
CREATE UNIQUE INDEX rote_steps_output_idx ON rote_step_log(output_table_id);
`,
  },
  {
    version: 3,
    name: "rote_replay_pipeline_attribution",
    sql: "ALTER TABLE rote_runs ADD COLUMN pipeline_id TEXT REFERENCES rote_pipelines(id);",
  },
  {
    version: 4,
    name: "rote_approved_example_parameters",
    sql: "ALTER TABLE rote_golden_examples ADD COLUMN parameter_values JSONB NOT NULL DEFAULT '{}';",
  },
  {
    version: 5,
    name: "rote_example_generations",
    sql: `
ALTER TABLE rote_golden_examples ADD COLUMN generation INTEGER NOT NULL DEFAULT 1 CHECK(generation > 0);
ALTER TABLE rote_pipelines ADD COLUMN generation INTEGER NOT NULL DEFAULT 1 CHECK(generation > 0);
`,
  },
];
