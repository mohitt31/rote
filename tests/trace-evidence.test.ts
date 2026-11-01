import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
let pg: PGlite, db: ReturnType<typeof drizzle>;
vi.mock("../server/db/index.js", () => ({ getDb: () => db, schema: {} }));
import { traceEvidence } from "../server/rote/trace-evidence.js";
const scope = { ownerEmail: "owner@example.test", orgId: "org" };
beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg);
  await pg.exec(
    `CREATE TABLE agent_trace_summaries(run_id TEXT,user_id TEXT,org_id TEXT,llm_calls INTEGER,total_input_tokens INTEGER,total_output_tokens INTEGER,total_cost_cents_x100 DOUBLE PRECISION,total_duration_ms DOUBLE PRECISION);CREATE TABLE agent_trace_spans(run_id TEXT,user_id TEXT,org_id TEXT,span_type TEXT,parent_span_id TEXT,status TEXT);INSERT INTO agent_trace_summaries VALUES ('fixture','owner@example.test','org',1,123,45,250,500);INSERT INTO agent_trace_spans VALUES ('fixture','owner@example.test','org','agent_run',NULL,'success');`,
  );
}, 20000);
afterAll(async () => pg.close());
it("reads measured fixture usage and converts hundredths of a cent to dollars", async () => {
  expect(await traceEvidence(["fixture", "fixture"], scope)).toEqual({
    traceRunId: "fixture",
    tokensIn: 123,
    tokensOut: 45,
    cost: 0.025,
    durationMs: 500,
  });
});
it("does not attribute another tenant or incomplete mixed lineage", async () => {
  expect(
    await traceEvidence(["fixture"], {
      ...scope,
      ownerEmail: "other@example.test",
    }),
  ).toBeNull();
  expect(
    await traceEvidence(["fixture"], { ...scope, orgId: null }),
  ).toBeNull();
  expect(await traceEvidence(["fixture", null], scope)).toBeNull();
  expect(await traceEvidence(["fixture", "another"], scope)).toBeNull();
});
it("rejects a trace without a successful completed root", async () => {
  await pg.exec("UPDATE agent_trace_spans SET status='paused'");
  expect(await traceEvidence(["fixture"], scope)).toBeNull();
});
