import { and, eq } from "drizzle-orm";

import { getDb, schema as s } from "../db/index.js";
import { requireScope, type Scope } from "./repository.js";
import { scoped } from "./workflow.js";

/** Public demo deployments set ROTE_PUBLIC_DEMO=true together with AUTH_DISABLED. */
export const isPublicDemo = () =>
  ["1", "true"].includes((process.env.ROTE_PUBLIC_DEMO ?? "").toLowerCase());

export const DEMO_RESET_MS = 60 * 60 * 1000;

/** Delete every Rote row owned by this scope, in foreign-key order. */
export async function resetWorkspaceData(scope: Scope) {
  requireScope(scope);
  await getDb().transaction(async (tx) => {
    await tx
      .update(s.tasks)
      .set({ currentPipelineId: null })
      .where(scoped(s.tasks, scope));
    await tx.delete(s.verifications).where(scoped(s.verifications, scope));
    await tx
      .update(s.pipelines)
      .set({ createdFromRunId: null })
      .where(scoped(s.pipelines, scope));
    await tx.delete(s.runs).where(scoped(s.runs, scope));
    await tx.delete(s.pipelines).where(scoped(s.pipelines, scope));
    await tx.delete(s.goldenExamples).where(scoped(s.goldenExamples, scope));
    await tx.delete(s.stepLog).where(scoped(s.stepLog, scope));
    await tx.delete(s.tasks).where(scoped(s.tasks, scope));
    await tx.delete(s.tables).where(scoped(s.tables, scope));
    await tx.delete(s.files).where(scoped(s.files, scope));
  });
}

/**
 * Serverless-friendly hourly reset: the first read after the window expires
 * wipes the shared demo workspace. The marker lives in rote_workspaces.
 */
export async function maybeResetDemo(scope: Scope, now = Date.now()) {
  if (!isPublicDemo()) return false;
  const id = `demo-reset:${scope.ownerEmail}:${scope.orgId ?? ""}`;
  const [marker] = await getDb()
    .select()
    .from(s.workspaces)
    .where(eq(s.workspaces.id, id))
    .limit(1);
  const last = marker ? Number(marker.name) : 0;
  if (marker && now - last < DEMO_RESET_MS) return false;
  if (marker) await resetWorkspaceData(scope);
  await getDb()
    .delete(s.workspaces)
    .where(and(eq(s.workspaces.id, id), scoped(s.workspaces, scope)));
  await getDb()
    .insert(s.workspaces)
    .values({ id, name: String(now), ...requireScope(scope) });
  return Boolean(marker);
}

export async function demoStatus(scope: Scope, now = Date.now()) {
  if (!isPublicDemo()) return { publicDemo: false as const, nextResetAt: null };
  const id = `demo-reset:${scope.ownerEmail}:${scope.orgId ?? ""}`;
  const [marker] = await getDb()
    .select()
    .from(s.workspaces)
    .where(eq(s.workspaces.id, id))
    .limit(1);
  const last = marker ? Number(marker.name) : now;
  return {
    publicDemo: true as const,
    nextResetAt: new Date(last + DEMO_RESET_MS).toISOString(),
  };
}
