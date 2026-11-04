import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

import { migrations } from "../server/db/migrations.js";
import * as schema from "../server/db/schema.js";
let pg: PGlite, db: ReturnType<typeof drizzle<typeof schema>>;
vi.mock("../server/db/index.js", () => ({ getDb: () => db, schema }));
import {
  demoAgentEnabled,
  demoAgentRemaining,
  takeDemoAgentTurn,
} from "../server/rote/demo-agent.js";

beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema });
  for (const m of migrations) await pg.exec(m.sql);
}, 20000);
afterAll(async () => pg.close());
afterEach(() => vi.unstubAllEnvs());

it("is off unless both the public demo and the agent flag are set", () => {
  vi.stubEnv("ROTE_PUBLIC_DEMO", "true");
  expect(demoAgentEnabled()).toBe(false);
  vi.stubEnv("ROTE_DEMO_AGENT", "true");
  expect(demoAgentEnabled()).toBe(true);
  vi.stubEnv("ROTE_PUBLIC_DEMO", "");
  expect(demoAgentEnabled()).toBe(false);
});

it("caps user-started turns per hour and resets in the next hour", async () => {
  vi.stubEnv("ROTE_DEMO_AGENT_TURNS_PER_HOUR", "3");
  const hour = 1_800_000_000_000;
  const results = [];
  for (let i = 0; i < 4; i++)
    results.push((await takeDemoAgentTurn("demo@x.test", hour)).ok);
  expect(results).toEqual([true, true, true, false]);
  expect(await demoAgentRemaining("demo@x.test", hour)).toBe(0);
  const next = hour + 60 * 60 * 1000;
  expect(await demoAgentRemaining("demo@x.test", next)).toBe(3);
  expect((await takeDemoAgentTurn("demo@x.test", next)).ok).toBe(true);
});
