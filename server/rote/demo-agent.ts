// Public demo agent: off unless ROTE_DEMO_AGENT=true. When on, the server's
// own free-tier model key answers visitors, with a hard shared hourly cap on
// user-started turns so the demo can never run up usage. The counter lives in
// rote_workspaces (one row per hour bucket) so it holds across serverless
// instances.
import { and, eq, sql } from "drizzle-orm";

import { getDb, schema as s } from "../db/index.js";
import { isPublicDemo } from "./demo.js";

const HOUR = 60 * 60 * 1000;

export const demoAgentEnabled = () =>
  isPublicDemo() &&
  ["1", "true"].includes(
    (process.env.ROTE_DEMO_AGENT ?? "").toLowerCase(), // guard:allow-env-credential — deploy-level boolean flag, not a credential
  );

export function demoAgentTurnsPerHour() {
  const raw = Number(
    process.env.ROTE_DEMO_AGENT_TURNS_PER_HOUR ?? "8", // guard:allow-env-credential — numeric limit, not a credential
  );
  return Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.floor(raw))) : 8;
}

const bucketId = (ownerEmail: string, now: number) =>
  `demo-agent:${ownerEmail}:${Math.floor(now / HOUR)}`;

/** Count one user-started agent turn; false once the hourly cap is reached. */
export async function takeDemoAgentTurn(ownerEmail: string, now = Date.now()) {
  const limit = demoAgentTurnsPerHour();
  const id = bucketId(ownerEmail, now);
  const [row] = await getDb()
    .insert(s.workspaces)
    .values({ id, name: "1", ownerEmail, orgId: null })
    .onConflictDoUpdate({
      target: s.workspaces.id,
      set: { name: sql`(cast(${s.workspaces.name} as integer) + 1)::text` },
    })
    .returning({ name: s.workspaces.name });
  const used = Number(row?.name ?? limit + 1);
  return { ok: used <= limit, used, limit };
}

/** Turns left this hour, for the UI. */
export async function demoAgentRemaining(ownerEmail: string, now = Date.now()) {
  const limit = demoAgentTurnsPerHour();
  const [row] = await getDb()
    .select({ name: s.workspaces.name })
    .from(s.workspaces)
    .where(
      and(
        eq(s.workspaces.id, bucketId(ownerEmail, now)),
        eq(s.workspaces.ownerEmail, ownerEmail),
      ),
    )
    .limit(1);
  return Math.max(0, limit - Number(row?.name ?? 0));
}
