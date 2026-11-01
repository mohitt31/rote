import { expect, it } from "vitest";
import { z } from "zod";

import { applyStep } from "../server/rote/steps.js";
import { stepSchemas } from "../shared/rote/model.js";

// Gemini rejects tool schemas whose enums contain an empty string; found in a
// real model run. Keep every step's JSON schema free of them.
function emptyEnums(node: unknown, path = "$"): string[] {
  if (!node || typeof node !== "object") return [];
  const out: string[] = [];
  const o = node as Record<string, unknown>;
  if (Array.isArray(o.enum) && o.enum.includes("")) out.push(path);
  if (o.const === "") out.push(path);
  for (const [k, v] of Object.entries(o))
    if (v && typeof v === "object") out.push(...emptyEnums(v, `${path}.${k}`));
  return out;
}

it("step tool schemas contain no empty-string enum values", () => {
  for (const [name, schema] of Object.entries(stepSchemas))
    expect(emptyEnums(z.toJSONSchema(schema, { io: "input" })), name).toEqual(
      [],
    );
});

it('parses "no thousands separator" as none, and legacy "" still works', () => {
  const t = { columns: ["n"], rows: [{ n: "1234.5" }] };
  for (const thousands of ["none", ""])
    expect(
      applyStep("parse_number", t, { column: "n", thousands }).rows[0]!.n,
    ).toBe(1234.5);
  expect(() =>
    applyStep(
      "parse_number",
      { columns: ["n"], rows: [{ n: "1,234" }] },
      {
        column: "n",
        thousands: "none",
      },
    ),
  ).toThrow(/Invalid numeric/);
});
