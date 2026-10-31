import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import {
  checkTable,
  cell,
  type Table,
  type Cell,
} from "../../shared/rote/model.js";
import { checkXlsxArchive } from "./xlsx-limit.js";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export async function parseFile(
  data: Buffer,
  filename: string,
): Promise<Table> {
  if (data.length > MAX_FILE_BYTES) throw Error("File exceeds 5 MiB");
  let cells: Cell[][];
  if (filename.toLowerCase().endsWith(".csv"))
    cells = parse(data.toString("utf8"), {
      bom: true,
      skip_empty_lines: true,
      max_record_size: 1024 * 1024,
    }) as string[][];
  else if (filename.toLowerCase().endsWith(".xlsx")) {
    checkXlsxArchive(data);
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data as never);
    if (workbook.worksheets.length !== 1)
      throw Error("XLSX must contain exactly one sheet");
    const sheet = workbook.worksheets[0]!;
    if (sheet.rowCount > 100001 || sheet.columnCount > 100)
      throw Error("Worksheet exceeds limits");
    cells = [];
    for (let n = 1; n <= sheet.rowCount; n++) {
      const row: Cell[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) {
        const value = sheet.getRow(n).getCell(c).value;
        if (value === null || value === undefined) row.push(null);
        else if (value instanceof Date) row.push(value.toISOString());
        else if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        )
          row.push(value);
        else
          throw Error(
            "Formula, error, hyperlink and rich-text cells are not supported; export values-only",
          );
      }
      cells.push(row);
    }
  } else throw Error("Only CSV and XLSX are supported");
  if (!cells.length) throw Error("File has no header");
  const headers = cells[0]!;
  if (headers.some((h) => typeof h !== "string" || h.trim() === ""))
    throw Error("Headers must be non-empty text");
  const columns = headers as string[];
  const rows = cells.slice(1).map((row) => {
    if (row.length !== columns.length) throw Error("Ragged row");
    return Object.fromEntries(columns.map((c, i) => [c, row[i] ?? null]));
  });
  return checkTable({ columns, rows });
}
export function exportCsv(table: Table): string {
  // Escape spreadsheet formulas on export; imported values remain unchanged in SQL.
  const safe = (v: Cell) =>
    typeof v === "string" && /^[\s]*[=+\-@\t\r]/.test(v) ? "'" + v : v;
  return stringify([
    table.columns.map(safe),
    ...table.rows.map((r) => table.columns.map((c) => safe(cell(r, c)))),
  ]);
}
