import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { MAX_FILE_BYTES } from "./io.js";
import type { Scope } from "./repository.js";
// Explicit local-only upload adapter. Hosted requests fail closed, never fall back to disk.
export async function localUploadDirectory(scope: Scope) {
  if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL)
    throw Error(
      "Local uploads are disabled with hosted storage; use a configured AttachmentRef",
    );
  const key = createHash("sha256").update(JSON.stringify(scope)).digest("hex");
  const dir = path.resolve("data/uploads/rote", key);
  await mkdir(dir, { recursive: true });
  return dir;
}
export async function readLocalUpload(uploadId: string, scope: Scope) {
  if (!/^[a-f0-9-]{36}\.(csv|xlsx)$/.test(uploadId))
    throw Error("Invalid upload ID");
  const dir = await localUploadDirectory(scope),
    file = await realpath(path.join(dir, uploadId));
  if (path.dirname(file) !== (await realpath(dir)))
    throw Error("Invalid upload path");
  if ((await stat(file)).size > MAX_FILE_BYTES)
    throw Error("File exceeds 5 MiB");
  return readFile(file);
}
