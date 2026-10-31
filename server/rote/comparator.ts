import { checkTable, type Table, type Row } from "../../shared/rote/model.js";
export type Comparison = {
  pass: boolean;
  missing: Row[];
  unexpected: Row[];
  missingCount: number;
  unexpectedCount: number;
  columnsMatch: boolean;
};
export function compareTables(
  expected: Table,
  actual: Table,
  tolerances: Record<string, number> = {},
): Comparison {
  checkTable(expected);
  checkTable(actual);
  for (const [c, n] of Object.entries(tolerances))
    if (!expected.columns.includes(c) || !Number.isFinite(n) || n < 0)
      throw Error("Invalid declared tolerance");
  const columnsMatch =
    JSON.stringify(expected.columns) === JSON.stringify(actual.columns);
  if (!columnsMatch)
    return {
      pass: false,
      missing: expected.rows.slice(0, 100),
      unexpected: actual.rows.slice(0, 100),
      missingCount: expected.rows.length,
      unexpectedCount: actual.rows.length,
      columnsMatch,
    };
  const cols = expected.columns;
  let missing: Row[] = [],
    unexpected: Row[] = [];
  if (!Object.keys(tolerances).length) {
    const groups = new Map<string, Row[]>();
    for (const r of actual.rows) {
      const k = JSON.stringify(cols.map((c) => r[c]));
      const g = groups.get(k);
      if (g) g.push(r);
      else groups.set(k, [r]);
    }
    for (const r of expected.rows) {
      const k = JSON.stringify(cols.map((c) => r[c]));
      const g = groups.get(k);
      if (g?.length) g.pop();
      else missing.push(r);
    }
    unexpected = [...groups.values()].flat();
  } else {
    if (expected.rows.length > 1000 || actual.rows.length > 1000)
      throw Error(
        "Tolerant comparison is limited to 1000 rows; exact comparison supports 100000",
      );
    // Maximum bipartite matching avoids a greedy match stealing another row's only match.
    const matches = expected.rows.map((e) =>
      actual.rows.flatMap((a, i) =>
        cols.every(
          (c) =>
            e[c] === a[c] ||
            (Object.prototype.hasOwnProperty.call(tolerances, c) &&
              typeof e[c] === "number" &&
              typeof a[c] === "number" &&
              Math.abs((e[c] as number) - (a[c] as number)) <= tolerances[c]!),
        )
          ? [i]
          : [],
      ),
    );
    const owner = new Map<number, number>();
    function assign(i: number, seen: Set<number>): boolean {
      for (const j of matches[i]!)
        if (!seen.has(j)) {
          seen.add(j);
          const previous = owner.get(j);
          if (previous === undefined || assign(previous, seen)) {
            owner.set(j, i);
            return true;
          }
        }
      return false;
    }
    for (let i = 0; i < expected.rows.length; i++)
      if (!assign(i, new Set())) missing.push(expected.rows[i]!);
    unexpected = actual.rows.filter((_, i) => !owner.has(i));
  }
  return {
    pass: !missing.length && !unexpected.length,
    missing: missing.slice(0, 100),
    unexpected: unexpected.slice(0, 100),
    missingCount: missing.length,
    unexpectedCount: unexpected.length,
    columnsMatch,
  };
}
export function validateComparator(golden: Table) {
  if (!golden.rows.length)
    throw Error("Check validation requires a non-empty golden");
  const changed = structuredClone(golden),
    column = golden.columns[0]!;
  changed.rows[0]![column] =
    golden.rows[0]![column] === null ? "__corrupted__" : null;
  const identical = compareTables(golden, golden).pass,
    changedRejected = !compareTables(golden, changed).pass,
    droppedRejected = !compareTables(golden, {
      columns: golden.columns,
      rows: golden.rows.slice(1),
    }).pass;
  return {
    pass: identical && changedRejected && droppedRejected,
    identical,
    changedRejected,
    droppedRejected,
  };
}
