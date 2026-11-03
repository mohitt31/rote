import { DateTime } from "luxon";
import { RE2JS } from "re2js";

import {
  cell,
  stepSchemas,
  type Table,
  type Row,
  type Cell,
  type StepName,
} from "../../shared/rote/model.js";
import { compileFormula, numeric } from "./formula.js";
const key = (r: Row, keys: string[]) =>
  JSON.stringify(keys.map((c) => cell(r, c)));
function text(v: Cell) {
  if (typeof v !== "string") throw Error("Expected text");
  return v;
}
function has(t: Table, names: string[]) {
  for (const c of names)
    if (!t.columns.includes(c)) throw Error(`Unknown column: ${c}`);
}
function fresh(t: Table, c: string) {
  if (t.columns.includes(c)) throw Error(`Output column already exists: ${c}`);
}
function mapped(
  t: Table,
  source: string,
  target: string,
  fn: (v: Cell, r: Row) => Cell,
  preserveNull = true,
): Table {
  has(t, [source]);
  if (target !== source) fresh(t, target);
  return {
    columns: target === source ? [...t.columns] : [...t.columns, target],
    rows: t.rows.map((r) => ({
      ...r,
      [target]:
        preserveNull && cell(r, source) === null
          ? null
          : fn(cell(r, source), r),
    })),
  };
}
function compare(a: Cell, b: Cell): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a !== typeof b) throw Error("Cannot compare mixed types");
  return a < b ? -1 : 1;
}
export function parseNumber(
  v: Cell,
  p: { decimal: string; thousands: string; currency: string },
): number {
  if (typeof v === "number") return numeric(v);
  if (p.decimal === p.thousands)
    throw Error("Decimal and thousands separators must differ");
  let s = text(v).trim(),
    negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (p.currency) {
    if (s.startsWith(p.currency)) s = s.slice(p.currency.length).trim();
    else if (s.endsWith(p.currency)) s = s.slice(0, -p.currency.length).trim();
  }
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const integer = p.thousands
    ? `(?:\\d+|\\d{1,3}(?:${esc(p.thousands)}\\d{3})+)`
    : "\\d+";
  if (!new RegExp(`^[+-]?${integer}(?:${esc(p.decimal)}\\d+)?$`).test(s))
    throw Error("Invalid numeric text or grouping");
  if (negative && /^[+-]/.test(s)) throw Error("Conflicting negative signs");
  if (p.thousands) s = s.split(p.thousands).join("");
  const n = Number(s.replace(p.decimal, ".")) * (negative ? -1 : 1);
  return numeric(n);
}
export function applyStep(
  name: StepName,
  table: Table,
  raw: unknown,
  right?: Table,
): Table {
  switch (name) {
    case "select_columns": {
      const p = stepSchemas[name].parse(raw);
      has(table, p.columns);
      if (new Set(p.columns).size !== p.columns.length)
        throw Error("Duplicate columns");
      return {
        columns: p.columns,
        rows: table.rows.map((r) =>
          Object.fromEntries(p.columns.map((c) => [c, cell(r, c)])),
        ),
      };
    }
    case "rename_columns": {
      const p = stepSchemas[name].parse(raw);
      has(table, Object.keys(p.mapping));
      const cols = table.columns.map((c) => p.mapping[c] ?? c);
      if (new Set(cols).size !== cols.length)
        throw Error("Rename creates duplicate columns");
      return {
        columns: cols,
        rows: table.rows.map((r) =>
          Object.fromEntries(
            table.columns.map((c, i) => [cols[i]!, cell(r, c)]),
          ),
        ),
      };
    }
    case "parse_date": {
      const p = stepSchemas[name].parse(raw);
      if (!DateTime.now().setZone(p.timezone).isValid)
        throw Error("Invalid timezone");
      return mapped(table, p.column, p.newColumn ?? p.column, (v) => {
        for (const f of p.formats) {
          const d =
            f === "ISO"
              ? DateTime.fromISO(text(v), { zone: p.timezone })
              : DateTime.fromFormat(text(v), f, {
                  zone: p.timezone,
                  locale: "en-US",
                });
          if (d.isValid) return d.toUTC().toISO()!;
        }
        throw Error("Date does not match declared formats");
      });
    }
    case "parse_number": {
      const p = stepSchemas[name].parse(raw);
      if (p.decimal === p.thousands)
        throw Error("Decimal and thousands separators must differ");
      const options = {
        ...p,
        thousands: p.thousands === "none" ? "" : p.thousands,
      };
      return mapped(table, p.column, p.newColumn ?? p.column, (v) =>
        parseNumber(v, options),
      );
    }
    case "normalize_text": {
      const p = stepSchemas[name].parse(raw);
      has(table, p.columns);
      return {
        columns: [...table.columns],
        rows: table.rows.map((r) => {
          const out = { ...r };
          for (const c of p.columns) {
            if (cell(r, c) === null) continue;
            let v = text(cell(r, c)).normalize(p.unicode);
            if (p.trim) v = v.trim();
            if (p.collapseSpaces) v = v.replace(/\s+/gu, " ");
            out[c] =
              p.case === "lower"
                ? v.toLowerCase()
                : p.case === "upper"
                  ? v.toUpperCase()
                  : v;
          }
          return out;
        }),
      };
    }
    case "regex_extract": {
      const p = stepSchemas[name].parse(raw);
      fresh(table, p.newColumn);
      const re = RE2JS.compile(p.pattern);
      if (p.group > re.groupCount()) throw Error("Capture group out of range");
      return mapped(table, p.column, p.newColumn, (v) => {
        const m = re.matcher(text(v));
        return m.find() ? m.group(p.group) : null;
      });
    }
    case "map_values": {
      const p = stepSchemas[name].parse(raw);
      const m = new Map(p.entries.map((e) => [JSON.stringify(e.from), e.to]));
      if (m.size !== p.entries.length) throw Error("Duplicate lookup keys");
      return mapped(
        table,
        p.column,
        p.newColumn ?? p.column,
        (v) => {
          const k = JSON.stringify(v);
          if (m.has(k)) return m.get(k)!;
          if (p.unmatched === "error") throw Error("Unmapped value");
          return p.unmatched === "null" ? null : v;
        },
        false,
      );
    }
    case "filter_rows": {
      const p = stepSchemas[name].parse(raw);
      has(
        table,
        p.predicates.map((q) => q.column),
      );
      for (const q of p.predicates)
        if (!["is_null", "not_null"].includes(q.op) && q.value === undefined)
          throw Error("Predicate value is required");
      return {
        columns: [...table.columns],
        rows: table.rows
          .filter((r) => {
            const matches = p.predicates.map((q) => {
              const v = cell(r, q.column),
                w = q.value ?? null;
              switch (q.op) {
                case "is_null":
                  return v === null;
                case "not_null":
                  return v !== null;
                case "eq":
                  return v === w;
                case "ne":
                  return v !== w;
                case "contains":
                  return v !== null && text(v).includes(text(w));
                default:
                  if (v === null || w === null) return false;
                  const n = compare(v, w);
                  return q.op === "gt"
                    ? n > 0
                    : q.op === "gte"
                      ? n >= 0
                      : q.op === "lt"
                        ? n < 0
                        : n <= 0;
              }
            });
            return p.mode === "all"
              ? matches.every(Boolean)
              : matches.some(Boolean);
          })
          .map((r) => ({ ...r })),
      };
    }
    case "dedupe": {
      const p = stepSchemas[name].parse(raw);
      has(table, p.keys);
      const indices = new Map<string, number>();
      table.rows.forEach((r, i) => {
        const k = key(r, p.keys);
        if (p.keep === "last" || !indices.has(k)) indices.set(k, i);
      });
      return {
        columns: [...table.columns],
        rows: table.rows
          .filter((r, i) => indices.get(key(r, p.keys)) === i)
          .map((r) => ({ ...r })),
      };
    }
    case "sort": {
      const p = stepSchemas[name].parse(raw);
      has(
        table,
        p.by.map((b) => b.column),
      );
      return {
        columns: [...table.columns],
        rows: table.rows
          .map((r) => ({ ...r }))
          .sort((a, b) => {
            for (const by of p.by) {
              const c = compare(cell(a, by.column), cell(b, by.column));
              if (c) return c * (by.direction === "asc" ? 1 : -1);
            }
            return 0;
          }),
      };
    }
    case "compute_column": {
      const p = stepSchemas[name].parse(raw);
      fresh(table, p.newColumn);
      const f = compileFormula(p.formula, table.columns);
      return {
        columns: [...table.columns, p.newColumn],
        rows: table.rows.map((r) => ({ ...r, [p.newColumn]: f(r) })),
      };
    }
    case "split_column": {
      const p = stepSchemas[name].parse(raw);
      has(table, [p.column]);
      for (const c of p.newColumns) fresh(table, c);
      if (new Set(p.newColumns).size !== p.newColumns.length)
        throw Error("Duplicate split columns");
      return {
        columns: [...table.columns, ...p.newColumns],
        rows: table.rows.map((r) => {
          const values =
            cell(r, p.column) === null
              ? []
              : text(cell(r, p.column)).split(p.separator);
          if (values.length > p.newColumns.length)
            throw Error("Split would discard parts");
          return {
            ...r,
            ...Object.fromEntries(
              p.newColumns.map((c, i) => [c, values[i] ?? null]),
            ),
          };
        }),
      };
    }
    case "group_aggregate": {
      const p = stepSchemas[name].parse(raw);
      has(table, [
        ...p.keys,
        ...p.aggregates.flatMap((a) => (a.column ? [a.column] : [])),
      ]);
      const cols = [...p.keys, ...p.aggregates.map((a) => a.newColumn)];
      if (new Set(cols).size !== cols.length)
        throw Error("Duplicate aggregate columns");
      for (const a of p.aggregates)
        if (a.op !== "count" && !a.column)
          throw Error("Aggregate requires column");
      const groups = new Map<string, Row[]>();
      if (p.keys.length === 0) groups.set("[]", []);
      for (const r of table.rows) {
        const k = key(r, p.keys);
        const g = groups.get(k);
        if (g) g.push(r);
        else groups.set(k, [r]);
      }
      return {
        columns: cols,
        rows: [...groups.values()].map((g) => {
          const out: Row = Object.fromEntries(
            p.keys.map((c) => [c, cell(g[0]!, c)]),
          );
          for (const a of p.aggregates) {
            const values = a.column
              ? g.map((r) => cell(r, a.column!)).filter((v) => v !== null)
              : [];
            if (a.op === "count") {
              out[a.newColumn] = a.column ? values.length : g.length;
              continue;
            }
            const nums = values.map(numeric);
            if (!nums.length) {
              out[a.newColumn] = null;
              continue;
            }
            const sum = nums.reduce((s, n) => s + n, 0);
            out[a.newColumn] = numeric(
              a.op === "sum"
                ? sum
                : a.op === "avg"
                  ? sum / nums.length
                  : a.op === "min"
                    ? nums.reduce((x, y) => Math.min(x, y))
                    : nums.reduce((x, y) => Math.max(x, y)),
            );
          }
          return out;
        }),
      };
    }
    case "join": {
      const p = stepSchemas[name].parse(raw);
      if (!right) throw Error("Right table required");
      has(
        table,
        p.keys.map((k) => k.left),
      );
      has(
        right,
        p.keys.map((k) => k.right),
      );
      for (const q of [p.amount, p.date])
        if (q) {
          has(table, [q.left]);
          has(right, [q.right]);
        }
      const rightNames = right.columns.map((c) =>
        table.columns.includes(c) ? c + p.suffix : c,
      );
      const cols = [...table.columns, ...rightNames];
      if (new Set(cols).size !== cols.length)
        throw Error("Join suffix creates column collisions");
      const buckets = new Map<string, Row[]>();
      for (const r of right.rows) {
        if (p.keys.some((k) => cell(r, k.right) === null)) continue;
        const k = key(
          r,
          p.keys.map((k) => k.right),
        );
        const b = buckets.get(k);
        if (b) b.push(r);
        else buckets.set(k, [r]);
      }
      const rows: Row[] = [];
      let comparisons = 0;
      for (const l of table.rows) {
        const candidates = p.keys.some((k) => cell(l, k.left) === null)
          ? []
          : (buckets.get(
              key(
                l,
                p.keys.map((k) => k.left),
              ),
            ) ?? []);
        let matched = false;
        for (const r of candidates) {
          if (++comparisons > 1000000)
            throw Error("Join comparison limit exceeded");
          if (
            p.amount &&
            (cell(l, p.amount.left) === null ||
              cell(r, p.amount.right) === null ||
              Math.abs(
                numeric(cell(l, p.amount.left)) -
                  numeric(cell(r, p.amount.right)),
              ) > p.amount.tolerance)
          )
            continue;
          if (p.date) {
            const a = DateTime.fromISO(text(cell(l, p.date.left)), {
                zone: "UTC",
              }),
              b = DateTime.fromISO(text(cell(r, p.date.right)), {
                zone: "UTC",
              });
            if (!a.isValid || !b.isValid) throw Error("Join dates must be ISO");
            if (
              Math.abs(a.toMillis() - b.toMillis()) >
              p.date.windowDays * 86400000
            )
              continue;
          }
          matched = true;
          rows.push({
            ...l,
            ...Object.fromEntries(
              right.columns.map((c, i) => [rightNames[i]!, cell(r, c)]),
            ),
          });
          if (rows.length > 100000) throw Error("Join output limit exceeded");
        }
        if (!matched && p.type === "left")
          rows.push({
            ...l,
            ...Object.fromEntries(rightNames.map((c) => [c, null])),
          });
      }
      return { columns: cols, rows };
    }
    case "validate": {
      const p = stepSchemas[name].parse(raw);
      has(table, [
        ...Object.keys(p.schema ?? {}),
        ...p.nonNull,
        ...p.unique.flat(),
        ...p.sumEquals.map((s) => s.column),
      ]);
      if (
        p.rowCount &&
        (p.rowCount.min > p.rowCount.max ||
          table.rows.length < p.rowCount.min ||
          table.rows.length > p.rowCount.max)
      )
        throw Error("Row count validation failed");
      for (const [c, type] of Object.entries(p.schema ?? {}))
        for (const r of table.rows)
          if (cell(r, c) !== null && typeof cell(r, c) !== type)
            throw Error(`Schema validation failed: ${c}`);
      for (const c of p.nonNull)
        if (table.rows.some((r) => cell(r, c) === null))
          throw Error(`Non-null validation failed: ${c}`);
      for (const keys of p.unique)
        if (
          new Set(table.rows.map((r) => key(r, keys))).size !==
          table.rows.length
        )
          throw Error(`Unique validation failed: ${keys.join(", ")}`);
      for (const q of p.sumEquals) {
        const sum = table.rows.reduce(
          (s, r) => s + numeric(cell(r, q.column)),
          0,
        );
        if (!Number.isFinite(sum) || Math.abs(sum - q.value) > q.tolerance)
          throw Error(`Sum validation failed: ${q.column}`);
      }
      return {
        columns: [...table.columns],
        rows: table.rows.map((r) => ({ ...r })),
      };
    }
  }
}
