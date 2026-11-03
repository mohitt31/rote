// Fetch India CDSCO "Not of Standard Quality" (NSQ) monthly drug alerts from
// the public JSON endpoints, one request per month, cached on disk with
// provenance. Run on a machine whose network allows cdscoonline.gov.in:
//   ./scripts/local pnpm exec tsx scripts/fetch-cdsco.ts 2025 [maxMonths]
// Not yet run: the cloud build environment blocks this host.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const BASE = "https://cdscoonline.gov.in/CDSCO";
const OUT = "data/cdsco";
const year = Number(process.argv[2] ?? "2025");
const maxMonths = Number(process.argv[3] ?? "6");
if (!Number.isInteger(year) || year < 2015 || year > 2100)
  throw Error("Pass a four-digit year");

async function getJson(url: string) {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "rote-hackathon/0.1" },
  });
  if (!res.ok) throw Error(`${res.status} ${res.statusText} for ${url}`);
  const text = await res.text();
  return { text, json: JSON.parse(text) as unknown };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

await mkdir(OUT, { recursive: true });
const months = await getJson(
  `${BASE}/publicReportingMonths?year=${year}&tab=nsq`,
);
const list = (Array.isArray(months.json) ? months.json : [])
  .map((m) =>
    typeof m === "string"
      ? m
      : String(
          (m as Record<string, unknown>).month ?? Object.values(m as object)[0],
        ),
  )
  .filter(Boolean)
  .slice(0, maxMonths);
if (!list.length)
  throw Error(
    `No months parsed from publicReportingMonths; raw response starts: ${months.text.slice(0, 200)}`,
  );

const manifest: {
  month: string;
  file: string;
  sha256: string;
  records: number | null;
  fetchedAt: string;
  url: string;
}[] = [];
for (const month of list) {
  const file = `${OUT}/nsq-${month}.json`;
  const url = `${BASE}/filteredNsqDrugTable?month=${encodeURIComponent(month)}&source=All&tab=nsq`;
  let text: string;
  if (existsSync(file)) text = await readFile(file, "utf8");
  else {
    text = (await getJson(url)).text;
    await writeFile(file, text);
    await sleep(2000); // be polite: one request per month, spaced out
  }
  const parsed = JSON.parse(text) as { aaData?: unknown[] };
  manifest.push({
    month,
    file,
    sha256: sha(text),
    records: Array.isArray(parsed.aaData) ? parsed.aaData.length : null,
    fetchedAt: new Date().toISOString(),
    url,
  });
}
await writeFile(
  `${OUT}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  `${OUT}/README.md`,
  [
    "# CDSCO NSQ snapshots (real public data)",
    "",
    "Source: Central Drugs Standard Control Organisation, India — public NSQ drug alert listings at https://cdscoonline.gov.in (no login).",
    "Fetched with scripts/fetch-cdsco.ts, one request per month, cached; see manifest.json for URL, fetch time and SHA-256 per file.",
    "",
    ...manifest.map(
      (m) => `- ${m.month}: ${m.records ?? "?"} records · sha256 ${m.sha256}`,
    ),
    "",
  ].join("\n"),
);
console.log(
  manifest.map((m) => `${m.month}: ${m.records ?? "?"} records`).join("\n"),
);
