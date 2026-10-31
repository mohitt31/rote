import { createHash } from "node:crypto";

import { defineAction } from "@agent-native/core/action";
import {
  resolveAttachment,
  unwrapAttachment,
  ATTACHMENT_REF_MAX_CHARS,
} from "@agent-native/core/private-blob";
import { z } from "zod";

import { scopeFor, guarded, errors } from "../server/rote/action-helpers.js";
import { parseFile } from "../server/rote/io.js";
import { readLocalUpload } from "../server/rote/local-files.js";
import { saveImport, RoteError } from "../server/rote/repository.js";
import { summarySchema } from "../shared/rote/model.js";
import { payoutSample, vendorSample } from "../shared/rote/samples.js";
const source = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("sample"),
      dataset: z.enum(["payouts", "bank", "vendors"]),
      week: z.number().int().min(1).max(20).default(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("upload"),
      uploadId: z.string().regex(/^[a-f0-9-]{36}\.(csv|xlsx)$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal("attachment"),
      ref: z.string().min(1).max(ATTACHMENT_REF_MAX_CHARS),
    })
    .strict(),
]);
export default defineAction({
  description:
    "Import CSV/XLSX from an owned upload, scoped AttachmentRef, or explicitly synthetic sample dataset. Returns table metadata only.",
  schema: z.object({ source }),
  outputSchema: summarySchema,
  errors,
  link: ({ result: r }) => ({
    url: "/workbench?table=" + encodeURIComponent(r.outputTableId),
    label: "Open imported table",
  }),
  run: async ({ source }, ctx) =>
    guarded(async () => {
      const scope = scopeFor(ctx);
      let data: Buffer, name: string, ref: string | undefined;
      if (source.kind === "sample") {
        data = Buffer.from(
          source.dataset === "vendors"
            ? vendorSample(source.week)
            : payoutSample(source.week)[source.dataset],
        );
        name = `sample-${source.dataset}-week-${source.week}.csv`;
      } else if (source.kind === "attachment") {
        const file = unwrapAttachment(
          await resolveAttachment(source.ref, scope),
        );
        data = file.data;
        name = file.filename;
        ref = source.ref;
      } else {
        try {
          data = await readLocalUpload(source.uploadId, scope);
          name = source.uploadId;
        } catch {
          throw new RoteError(
            "Upload unavailable in this workspace or local storage disabled",
          );
        }
      }
      let table;
      try {
        table = await parseFile(data, name);
      } catch (e) {
        throw new RoteError(e instanceof Error ? e.message : "Invalid file");
      }
      return saveImport(table, name, scope, {
        sha256: createHash("sha256").update(data).digest("hex"),
        sample: source.kind === "sample",
        ...(ref ? { attachmentRef: ref } : {}),
      });
    }),
});
