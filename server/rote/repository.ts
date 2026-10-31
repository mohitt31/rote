import { randomUUID } from "node:crypto";

import { and, eq, isNull, desc } from "drizzle-orm";

import {
  checkTable,
  stepSchemas,
  type Table,
  type StepName,
} from "../../shared/rote/model.js";
import { getDb, schema } from "../db/index.js";
import { fingerprint } from "./fingerprint.js";
import { applyStep } from "./steps.js";
export type Scope = { ownerEmail: string; orgId: string | null };
export class RoteError extends Error {}
export function requireScope(scope: Scope) {
  if (!scope.ownerEmail) throw new RoteError("Authenticated identity required");
  return scope;
}
export const owned = (scope: Scope) =>
  and(
    eq(schema.tables.ownerEmail, requireScope(scope).ownerEmail),
    scope.orgId === null
      ? isNull(schema.tables.orgId)
      : eq(schema.tables.orgId, scope.orgId),
  );
export async function readTable(id: string, scope: Scope) {
  const [row] = await getDb()
    .select()
    .from(schema.tables)
    .where(and(eq(schema.tables.id, id), owned(scope)))
    .limit(1);
  if (!row) throw new RoteError("Table not found in this workspace");
  return row;
}
export function tableRecord(
  table: Table,
  name: string,
  scope: Scope,
  sample = false,
) {
  checkTable(table);
  const fp = fingerprint(table);
  return {
    id: randomUUID(),
    name,
    columns: table.columns,
    rows: table.rows,
    columnSchema: fp.columns,
    fingerprint: fp.hash,
    rowCount: table.rows.length,
    sample,
    ...requireScope(scope),
  };
}
export function summary(row: {
  id: string;
  rowCount: number;
  columns: string[];
  fingerprint: string;
}) {
  return {
    outputTableId: row.id,
    rowCount: row.rowCount,
    columns: row.columns,
    fingerprint: row.fingerprint,
  };
}
export async function saveImport(
  table: Table,
  name: string,
  scope: Scope,
  file: { sha256: string; attachmentRef?: string; sample: boolean },
) {
  const record = tableRecord(table, name, scope, file.sample),
    fileId = randomUUID();
  await getDb().transaction(async (tx) => {
    await tx
      .insert(schema.files)
      .values({
        id: fileId,
        name,
        sha256: file.sha256,
        attachmentRef: file.attachmentRef,
        sample: file.sample,
        ...scope,
      });
    await tx.insert(schema.tables).values({ ...record, fileId });
  });
  return summary(record);
}
export async function runStep(
  name: StepName,
  inputTableId: string,
  params: unknown,
  scope: Scope,
  traceRunId?: string,
) {
  const started = performance.now();
  const input = await readTable(inputTableId, scope);
  let output: Table;
  let parsed: unknown;
  try {
    parsed = stepSchemas[name].parse(params);
  } catch {
    throw new RoteError("Invalid step parameters");
  }
  const right =
    name === "join"
      ? await readTable(
          (parsed as { rightTableId: string }).rightTableId,
          scope,
        )
      : undefined;
  try {
    output = applyStep(name, input, parsed, right);
    checkTable(output);
  } catch (e) {
    throw new RoteError(e instanceof Error ? e.message : "Step failed");
  }
  const record = tableRecord(
    output,
    `${input.name} · ${name}`,
    scope,
    input.sample || (right?.sample ?? false),
  );
  await getDb().transaction(async (tx) => {
    await tx.insert(schema.tables).values(record);
    await tx
      .insert(schema.stepLog)
      .values({
        id: randomUUID(),
        action: name,
        inputTableId,
        outputTableId: record.id,
        params: parsed,
        traceRunId,
        durationMs: performance.now() - started,
        ...scope,
      });
  });
  return summary(record);
}
export async function listTables(scope: Scope) {
  return getDb()
    .select({
      id: schema.tables.id,
      name: schema.tables.name,
      rowCount: schema.tables.rowCount,
      columns: schema.tables.columns,
      sample: schema.tables.sample,
    })
    .from(schema.tables)
    .where(owned(scope))
    .orderBy(desc(schema.tables.createdAt))
    .limit(100);
}
