import ExcelJS from "exceljs";
import { it, expect } from "vitest";

import { parseFile, exportCsv } from "../server/rote/io.js";
import { payoutSample, vendorSample } from "../shared/rote/samples.js";
it("reads BOM, quoted commas, multiline text, empty values", async () =>
  expect(
    await parseFile(
      Buffer.from('\ufeffid,text\r\n1,"a,b\nc"\r\n2,\r\n'),
      "x.csv",
    ),
  ).toEqual({
    columns: ["id", "text"],
    rows: [
      { id: "1", text: "a,b\nc" },
      { id: "2", text: "" },
    ],
  }));
it.each(["a,a\n1,2", "a,b\n1", "\n", "__proto__\nx"])(
  "rejects malformed CSV %s",
  async (csv) => expect(parseFile(Buffer.from(csv), "x.csv")).rejects.toThrow(),
);
it("reads XLSX values and dates", async () => {
  const w = new ExcelJS.Workbook();
  const s = w.addWorksheet("input");
  s.addRow(["id", "value"]);
  s.addRow(["a", 10]);
  const out = await parseFile(
    Buffer.from(await w.xlsx.writeBuffer()),
    "x.xlsx",
  );
  expect(out.rows).toEqual([{ id: "a", value: 10 }]);
});
it("rejects XLSX formulas and multiple sheets", async () => {
  const w = new ExcelJS.Workbook();
  w.addWorksheet("input").addRows([["id"], [{ formula: "1+1", result: 2 }]]);
  await expect(
    parseFile(Buffer.from(await w.xlsx.writeBuffer()), "x.xlsx"),
  ).rejects.toThrow(/Formula/);
  w.addWorksheet("second");
  await expect(
    parseFile(Buffer.from(await w.xlsx.writeBuffer()), "x.xlsx"),
  ).rejects.toThrow(/one sheet/);
});
it("escapes spreadsheet formulas while preserving numeric negatives", () =>
  expect(
    exportCsv({
      columns: ["x"],
      rows: [{ x: "=SUM(A1)" }, { x: -2 }, { x: "a,b" }],
    }),
  ).toBe('x\n\'=SUM(A1)\n-2\n"a,b"\n'));
it("generates reproducible, varied, labeled sample inputs", async () => {
  expect(payoutSample(1)).toEqual(payoutSample(1));
  expect(payoutSample(1)).not.toEqual(payoutSample(2));
  expect(
    (await parseFile(Buffer.from(payoutSample(1).payouts), "p.csv")).rows,
  ).toHaveLength(25);
  expect(
    (await parseFile(Buffer.from(vendorSample(1)), "v.csv")).rows,
  ).toHaveLength(29);
});

it("bounds actual XLSX expansion before workbook parsing", async () => {
  const { checkXlsxArchive } = await import("../server/rote/xlsx-limit.js");
  const w = new ExcelJS.Workbook();
  w.addWorksheet("Data").addRows([["x"], ["a".repeat(5000)]]);
  const b = Buffer.from(await w.xlsx.writeBuffer());
  expect(() => checkXlsxArchive(b, 2000)).toThrow();
  expect(() => checkXlsxArchive(b)).not.toThrow();
  expect(() => checkXlsxArchive(Buffer.from("invalid"))).toThrow();
});
