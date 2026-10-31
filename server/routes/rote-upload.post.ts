import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { getOrgContext } from "@agent-native/core/org";
import { getSession } from "@agent-native/core/server";
import {
  defineEventHandler,
  createError,
  readFormData,
  assertBodySize,
  getHeader,
  getRequestURL,
} from "h3";

import { MAX_FILE_BYTES } from "../rote/io.js";
import { localUploadDirectory } from "../rote/local-files.js";
// Local multipart protocol only. Durable hosted uploads use scoped AttachmentRefs.
export default defineEventHandler(async (event) => {
  const session = await getSession(event);
  if (!session?.email)
    throw createError({ statusCode: 401, statusMessage: "Sign in first" });
  if (getHeader(event, "origin") !== getRequestURL(event).origin)
    throw createError({
      statusCode: 403,
      statusMessage: "Same-origin upload required",
    });
  assertBodySize(event, MAX_FILE_BYTES + 65536);
  const body = await readFormData(event),
    file = body.get("file");
  if (!(file instanceof File) || file.size > MAX_FILE_BYTES)
    throw createError({
      statusCode: 400,
      statusMessage: "Upload one CSV/XLSX file, at most 5 MiB",
    });
  const ext = path.extname(file.name).toLowerCase();
  if (![".csv", ".xlsx"].includes(ext))
    throw createError({
      statusCode: 400,
      statusMessage: "Only CSV/XLSX are supported",
    });
  const { orgId } = await getOrgContext(event);
  let dir: string;
  try {
    dir = await localUploadDirectory({ ownerEmail: session.email, orgId });
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: "Configure private attachment storage for hosted uploads",
    });
  }
  const uploadId = randomUUID() + ext;
  await writeFile(
    path.join(dir, uploadId),
    Buffer.from(await file.arrayBuffer()),
    { flag: "wx", mode: 0o600 },
  );
  return { uploadId };
});
