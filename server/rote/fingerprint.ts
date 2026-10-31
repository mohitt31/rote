import { createHash } from "node:crypto";

import type { Table } from "../../shared/rote/model.js";
export function describeTable(table: Table) {
  return table.columns.map((name) => {
    const types = new Set<string>();
    let nulls = 0;
    for (const r of table.rows) {
      if (r[name] === null) nulls++;
      else types.add(typeof r[name]);
    }
    return { name, types: [...types].sort(), nulls };
  });
}
export function fingerprint(table: Table) {
  const columns = describeTable(table);
  return {
    columns,
    hash: createHash("sha256")
      .update(
        JSON.stringify(columns.map(({ name, types }) => ({ name, types }))),
      )
      .digest("hex"),
  };
}
