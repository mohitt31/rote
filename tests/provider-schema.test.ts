import { it, expect } from "vitest";
import { z } from "zod";

import { stepSchemas } from "../shared/rote/model.js";
it("accepts no thousands separator without emitting a Gemini-invalid empty enum", () => {
  const schema = stepSchemas.parse_number;
  expect(schema.parse({ column: "amount", thousands: "" }).thousands).toBe("");
  expect(() => schema.parse({ column: "amount", thousands: ";" })).toThrow();
  const json = z.toJSONSchema(schema);
  function check(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [k, v] of Object.entries(value)) {
      if (k === "enum" && Array.isArray(v)) expect(v).not.toContain("");
      check(v);
    }
  }
  check(json);
});
