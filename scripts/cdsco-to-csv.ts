// Convert cached CDSCO NSQ monthly JSON snapshots (from fetch-cdsco.ts) into
// one CSV per month that Rote's importer reads. Values are kept as published
// except for whitespace collapsing and HTML tag removal; no row is dropped.
//   ./scripts/local pnpm exec tsx scripts/cdsco-to-csv.ts
import { readdir, readFile, writeFile } from "node:fs/promises";

const DIR = "data/cdsco";
const files = (await readdir(DIR)).filter((f) => /^nsq-.+\.json$/.test(f));
if (!files.length) throw Error(`No nsq-*.json files in ${DIR}; run fetch-cdsco.ts first`);

const clean = (v: unknown) =>
  v === null || v === undefined
    ? ""
    : String(v)
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
const cell = (v: string) =>
  /[",\n]/.test(v) || /^[=+\-@]/.test(v)
    ? `"${(/^[=+\-@]/.test(v) ? "'" : "") + v.replace(/"/g, '""')}"`
    : v;

for (const f of files.sort()) {
  const parsed = JSON.parse(await readFile(`${DIR}/${f}`, "utf8")) as {
    aaData?: Record<string, unknown>[];
  };
  const rows = Array.isArray(parsed.aaData) ? parsed.aaData : [];
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(
    (c) => rows.some((r) => clean(r[c]) !== ""),
  );
  const csv = [
    columns.join(","),
    ...rows.map((r) => columns.map((c) => cell(clean(r[c]))).join(",")),
  ].join("\n");
  const out = `${DIR}/${f.replace(/\.json$/, ".csv")}`;
  await writeFile(out, csv + "\n");
  console.log(`${out}: ${rows.length} rows, ${columns.length} columns (${columns.join(", ")})`);
}
