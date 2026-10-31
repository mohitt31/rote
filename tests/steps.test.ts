import { describe, it, expect } from "vitest";

import { applyStep, parseNumber } from "../server/rote/steps.js";
import { checkTable, stepNames, type Table } from "../shared/rote/model.js";
const table: Table = {
  columns: ["id", "name", "amount", "date"],
  rows: [
    { id: "a", name: "  Café  SHOP ", amount: "$1,234.50", date: "31/10/2026" },
    { id: "b", name: "cafe", amount: "($24.50)", date: "01/11/2026" },
    { id: "a", name: null, amount: "$0.00", date: null },
  ],
};
const nums: Table = {
  columns: ["k", "n"],
  rows: [
    { k: "a", n: 2 },
    { k: "b", n: 3 },
    { k: "a", n: 4 },
  ],
};
describe("15 deterministic primitives", () => {
  it("has all 15 steps", () => expect(stepNames).toHaveLength(15));
  it("selects ordered columns without mutating input", () => {
    const before = structuredClone(table);
    expect(
      applyStep("select_columns", table, { columns: ["name", "id"] }).columns,
    ).toEqual(["name", "id"]);
    expect(table).toEqual(before);
  });
  it("rejects unknown columns and collisions", () => {
    expect(() =>
      applyStep("select_columns", table, { columns: ["bad"] }),
    ).toThrow();
    expect(() =>
      applyStep("rename_columns", table, { mapping: { id: "name" } }),
    ).toThrow();
    expect(() =>
      applyStep("rename_columns", table, { mapping: { missing: "x" } }),
    ).toThrow();
  });
  it("renames headers", () =>
    expect(
      applyStep("rename_columns", table, { mapping: { id: "reference" } })
        .rows[0],
    ).toHaveProperty("reference", "a"));
  it("parses explicit dates and timezone", () => {
    const out = applyStep("parse_date", table, {
      column: "date",
      formats: ["dd/MM/yyyy"],
      timezone: "Asia/Kolkata",
    });
    expect(out.rows[0]?.date).toBe("2026-10-30T18:30:00.000Z");
    expect(out.rows[2]?.date).toBeNull();
  });
  it("rejects impossible dates and unknown timezone", () => {
    expect(() =>
      applyStep(
        "parse_date",
        { columns: ["d"], rows: [{ d: "31/02/2026" }] },
        { column: "d", formats: ["dd/MM/yyyy"] },
      ),
    ).toThrow();
    expect(() =>
      applyStep("parse_date", table, {
        column: "date",
        formats: ["dd/MM/yyyy"],
        timezone: "bad",
      }),
    ).toThrow();
  });
  it("parses currency, grouping and negative parentheses", () =>
    expect(
      applyStep("parse_number", table, {
        column: "amount",
        currency: "$",
      }).rows.map((r) => r.amount),
    ).toEqual([1234.5, -24.5, 0]));
  it.each(["12,34.5", "USD 1", "1e3", "Infinity", "--1", "(-1)"])(
    "rejects invalid number %s",
    (s) =>
      expect(() =>
        parseNumber(s, { decimal: ".", thousands: ",", currency: "$" }),
      ).toThrow(),
  );
  it("parses decimal comma", () =>
    expect(
      parseNumber("€1.234,50", { decimal: ",", thousands: ".", currency: "€" }),
    ).toBe(1234.5));
  it("normalizes whitespace/case/Unicode and preserves null", () =>
    expect(
      applyStep("normalize_text", table, {
        columns: ["name"],
        case: "lower",
      }).rows.map((r) => r.name),
    ).toEqual(["café shop", "cafe", null]));
  it("extracts RE2 groups and nonmatches", () =>
    expect(
      applyStep("regex_extract", table, {
        column: "name",
        pattern: "(Café)",
        group: 1,
        newColumn: "match",
      }).rows.map((r) => r.match),
    ).toEqual(["Café", null, null]));
  it("rejects unsupported regex and group indexes", () => {
    expect(() =>
      applyStep("regex_extract", table, {
        column: "name",
        pattern: "(?=x)",
        newColumn: "m",
      }),
    ).toThrow();
    expect(() =>
      applyStep("regex_extract", table, {
        column: "name",
        pattern: "x",
        group: 2,
        newColumn: "m",
      }),
    ).toThrow();
  });
  it("maps typed values and rejects duplicate lookup keys", () => {
    expect(
      applyStep("map_values", nums, {
        column: "n",
        entries: [{ from: 2, to: "two" }],
      }).rows[0]?.n,
    ).toBe("two");
    expect(() =>
      applyStep("map_values", nums, {
        column: "n",
        entries: [
          { from: 2, to: 1 },
          { from: 2, to: 3 },
        ],
      }),
    ).toThrow();
  });
  it("filters with all/any, preserves null semantics", () => {
    expect(
      applyStep("filter_rows", nums, {
        predicates: [{ column: "n", op: "gt", value: 2 }],
      }).rows,
    ).toHaveLength(2);
    expect(
      applyStep("filter_rows", table, {
        predicates: [{ column: "name", op: "is_null" }],
      }).rows,
    ).toHaveLength(1);
    expect(() =>
      applyStep("filter_rows", nums, {
        predicates: [{ column: "n", op: "gt" }],
      }),
    ).toThrow();
  });
  it("deduplicates with typed composite keys and first/last policy", () => {
    expect(
      applyStep("dedupe", nums, { keys: ["k"], keep: "first" }).rows.map(
        (r) => r.n,
      ),
    ).toEqual([2, 3]);
    expect(
      applyStep("dedupe", nums, { keys: ["k"], keep: "last" }).rows.map(
        (r) => r.n,
      ),
    ).toEqual([3, 4]);
  });
  it("joins all matching rows, retaining unmatched left rows", () => {
    const right: Table = {
      columns: ["key", "label"],
      rows: [
        { key: "a", label: "A" },
        { key: "a", label: "B" },
      ],
    };
    const out = applyStep(
      "join",
      nums,
      { rightTableId: "right", keys: [{ left: "k", right: "key" }] },
      right,
    );
    expect(out.rows).toHaveLength(5);
    expect(out.rows[2]?.label).toBeNull();
    expect(
      applyStep(
        "join",
        nums,
        {
          rightTableId: "right",
          keys: [{ left: "k", right: "key" }],
          type: "inner",
        },
        right,
      ).rows,
    ).toHaveLength(4);
  });
  it("honors amount/date window and never matches null keys", () => {
    const left: Table = {
      columns: ["id", "amount", "date"],
      rows: [
        { id: "x", amount: 10, date: "2026-10-01" },
        { id: null, amount: 10, date: "2026-10-01" },
      ],
    };
    const right: Table = {
      columns: ["id", "amount", "date"],
      rows: [
        { id: "x", amount: 10.01, date: "2026-10-02" },
        { id: "x", amount: 50, date: "2026-10-02" },
        { id: null, amount: 10, date: "2026-10-01" },
      ],
    };
    const out = applyStep(
      "join",
      left,
      {
        rightTableId: "r",
        keys: [{ left: "id", right: "id" }],
        amount: { left: "amount", right: "amount", tolerance: 0.02 },
        date: { left: "date", right: "date", windowDays: 1 },
      },
      right,
    );
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]?.amount_right).toBe(10.01);
    expect(out.rows[1]?.amount_right).toBeNull();
  });
  it("rejects ambiguous suffix collision", () =>
    expect(() =>
      applyStep(
        "join",
        { columns: ["k", "k_right"], rows: [] },
        { rightTableId: "r", keys: [{ left: "k", right: "k" }] },
        { columns: ["k"], rows: [] },
      ),
    ).toThrow());
  it("aggregates all five functions", () => {
    const out = applyStep("group_aggregate", nums, {
      keys: ["k"],
      aggregates: ["sum", "count", "min", "max", "avg"].map((op) => ({
        op,
        column: "n",
        newColumn: op,
      })),
    });
    expect(out.rows[0]).toEqual({
      k: "a",
      sum: 6,
      count: 2,
      min: 2,
      max: 4,
      avg: 3,
    });
  });
  it("returns null for sum of empty group and zero count", () =>
    expect(
      applyStep(
        "group_aggregate",
        { columns: ["n"], rows: [] },
        {
          keys: [],
          aggregates: [
            { op: "sum", column: "n", newColumn: "sum" },
            { op: "count", newColumn: "count" },
          ],
        },
      ).rows,
    ).toEqual([{ sum: null, count: 0 }]));
  it("sorts stably", () =>
    expect(
      applyStep("sort", nums, {
        by: [{ column: "k", direction: "asc" }],
      }).rows.map((r) => r.n),
    ).toEqual([2, 4, 3]));
  it("computes arithmetic precedence, unary minus, and string concat", () => {
    expect(
      applyStep("compute_column", nums, {
        newColumn: "v",
        formula: "-([n] + 2) * 3 / 2",
      }).rows[0]?.v,
    ).toBe(-6);
    expect(
      applyStep("compute_column", nums, {
        newColumn: "v",
        formula: '[k] + "!"',
      }).rows[0]?.v,
    ).toBe("a!");
  });
  it.each([
    "process.exit()",
    "[n].constructor",
    "[n] / 0",
    '[n] + "2"',
    "[missing]",
    "1; alert(1)",
    '("x")()',
  ])("rejects unsafe or invalid formula %s", (formula) =>
    expect(() =>
      applyStep("compute_column", nums, { newColumn: "v", formula }),
    ).toThrow(),
  );
  it("splits without silently losing data", () => {
    expect(
      applyStep(
        "split_column",
        { columns: ["s"], rows: [{ s: "a|b" }, { s: null }] },
        { column: "s", separator: "|", newColumns: ["a", "b"] },
      ).rows[1],
    ).toEqual({ s: null, a: null, b: null });
    expect(() =>
      applyStep(
        "split_column",
        { columns: ["s"], rows: [{ s: "a|b|c" }] },
        { column: "s", separator: "|", newColumns: ["a", "b"] },
      ),
    ).toThrow();
  });
  it("validates a correct schema, non-null, unique, sum and count", () =>
    expect(
      applyStep("validate", nums, {
        schema: { n: "number" },
        nonNull: ["n"],
        unique: [["k", "n"]],
        sumEquals: [{ column: "n", value: 9 }],
        rowCount: { min: 3, max: 3 },
      }),
    ).toEqual(nums));
  it.each([
    { schema: { n: "string" } },
    { unique: [["k"]] },
    { sumEquals: [{ column: "n", value: 10 }] },
    { rowCount: { min: 4, max: 6 } },
    { rowCount: { min: 4, max: 2 } },
  ])("fails incorrect validation %j", (params) =>
    expect(() => applyStep("validate", nums, params)).toThrow(),
  );
  it("rejects null assertion, unsafe headers, ragged rows, nonfinite cells", () => {
    expect(() => applyStep("validate", table, { nonNull: ["name"] })).toThrow();
    expect(() => checkTable({ columns: ["__proto__"], rows: [] })).toThrow();
    expect(() => checkTable({ columns: ["x"], rows: [{ y: 1 }] })).toThrow();
    expect(() => checkTable({ columns: ["x"], rows: [{ x: NaN }] })).toThrow();
  });
});

it("map_values can explicitly map null, without converting unmapped values", () => {
  expect(
    applyStep(
      "map_values",
      { columns: ["x"], rows: [{ x: null }, { x: "a" }] },
      { column: "x", entries: [{ from: null, to: "missing" }] },
    ).rows,
  ).toEqual([{ x: "missing" }, { x: "a" }]);
});
