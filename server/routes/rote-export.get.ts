import { getOrgContext } from "@agent-native/core/org";
import { getSession } from "@agent-native/core/server";
import { defineEventHandler, createError, getQuery, setHeader } from "h3";

import { exportCsv } from "../rote/io.js";
import { readTable, RoteError } from "../rote/repository.js";
// Protocol exception: stream/download file bytes; normal data operations remain actions.
export default defineEventHandler(async (event) => {
  const session = await getSession(event);
  if (!session?.email)
    throw createError({ statusCode: 401, statusMessage: "Sign in first" });
  const { orgId } = await getOrgContext(event);
  const id = getQuery(event).table;
  if (typeof id !== "string")
    throw createError({ statusCode: 400, statusMessage: "Table ID required" });
  try {
    const t = await readTable(id, { ownerEmail: session.email, orgId });
    setHeader(event, "Content-Type", "text/csv; charset=utf-8");
    setHeader(
      event,
      "Content-Disposition",
      'attachment; filename="rote-export.csv"',
    );
    setHeader(event, "Cache-Control", "private, no-store");
    return exportCsv(t);
  } catch (e) {
    if (e instanceof RoteError)
      throw createError({ statusCode: 404, statusMessage: "Table not found" });
    throw e;
  }
});
