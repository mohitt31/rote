import type { ActionRunContext } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";

import { getDb, schema as s } from "../db/index.js";
import { RoteError, type Scope } from "./repository.js";
import { scoped } from "./workflow.js";

// The blog rule this enforces: the model never sees the holdout. Approved
// holdout reference tables are readable only by a signed-in human in the app
// UI; agent tools, MCP, A2A, automations and the CLI are refused.
export const isAppUser = (ctx?: ActionRunContext) => ctx?.caller === "frontend";

export async function holdoutReferenceIds(scope: Scope) {
  const rows = await getDb()
    .select({ id: s.goldenExamples.outputTableId })
    .from(s.goldenExamples)
    .where(
      and(eq(s.goldenExamples.holdout, true), scoped(s.goldenExamples, scope)),
    );
  return new Set(rows.map((r) => r.id));
}

export async function assertReadable(
  tableIds: (string | undefined)[],
  scope: Scope,
  ctx?: ActionRunContext,
) {
  if (isAppUser(ctx)) return;
  const reserved = await holdoutReferenceIds(scope);
  if (tableIds.some((id) => id && reserved.has(id)))
    throw new RoteError(
      "Holdout references are reserved for verification and are not available to agents",
    );
}
