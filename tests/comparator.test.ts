import { it, expect } from "vitest";

import {
  compareTables,
  validateComparator,
} from "../server/rote/comparator.js";
import { fingerprint } from "../server/rote/fingerprint.js";
import type { Table } from "../shared/rote/model.js";
const t: Table = {
  columns: ["id", "n"],
  rows: [
    { id: "a", n: 1 },
    { id: "b", n: 2 },
    { id: "a", n: 1 },
  ],
};
it("validates the check against identical, corrupted and dropped rows", () =>
  expect(validateComparator(t)).toEqual({
    pass: true,
    identical: true,
    changedRejected: true,
    droppedRejected: true,
  }));
it("compares row multisets independent of order", () =>
  expect(
    compareTables(t, { columns: t.columns, rows: [...t.rows].reverse() }).pass,
  ).toBe(true));
it("preserves duplicate multiplicity", () => {
  const diff = compareTables(t, {
    columns: t.columns,
    rows: t.rows.slice(0, 2),
  });
  expect(diff.pass).toBe(false);
  expect(diff.missingCount).toBe(1);
});
it("does not coerce strings, nulls or empty strings", () => {
  for (const v of ["1", null, ""])
    expect(
      compareTables(
        { columns: ["x"], rows: [{ x: 1 }] },
        { columns: ["x"], rows: [{ x: v }] },
      ).pass,
    ).toBe(false);
});
it("requires identical ordered columns", () =>
  expect(
    compareTables(t, { columns: ["n", "id"], rows: t.rows }).columnsMatch,
  ).toBe(false));
it("applies declared tolerances only and resolves non-greedy matching", () => {
  const a = { columns: ["n"], rows: [{ n: 1 }, { n: 0 }] },
    b = { columns: ["n"], rows: [{ n: 0 }, { n: 2 }] };
  expect(compareTables(a, b, { n: 1 }).pass).toBe(true);
  expect(compareTables(a, b).pass).toBe(false);
  expect(() => compareTables(a, b, { n: -1 })).toThrow();
});
it("bounds diff output but keeps real totals", () => {
  const a = {
    columns: ["n"],
    rows: Array.from({ length: 200 }, (_, n) => ({ n })),
  };
  const d = compareTables(a, { columns: ["n"], rows: [] });
  expect(d.missing).toHaveLength(100);
  expect(d.missingCount).toBe(200);
});
it("refuses empty golden self-check", () =>
  expect(() => validateComparator({ columns: ["x"], rows: [] })).toThrow());
it("fingerprint tracks columns/types, not changing weekly counts", () => {
  expect(fingerprint(t).hash).toBe(
    fingerprint({ ...t, rows: t.rows.slice(0, 1) }).hash,
  );
  expect(fingerprint(t).hash).not.toBe(
    fingerprint({ ...t, rows: [{ id: "a", n: "1" }] }).hash,
  );
});
