import { appPath } from "@agent-native/core/client/api-path";
import { writeClientAppState } from "@agent-native/core/client/application-state";
import {
  useActionQuery,
  useActionMutation,
  callAction,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uploadRoteFile } from "@/lib/rote-upload";
import { runWorkbenchStep } from "@/lib/run-step";

import { stepExamples } from "../../shared/rote/examples";
import {
  stepNames,
  summarySchema,
  type StepName,
} from "../../shared/rote/model";
export function meta() {
  return [{ title: "Rote · Data workbench" }];
}
export default function Workbench() {
  const t = useT();
  const [search, setSearch] = useSearchParams(),
    id = search.get("table") ?? "";
  const list = useActionQuery("list-tables", {});
  const preview = useActionQuery(
    "preview-table",
    { inputTableId: id, limit: 20 },
    { enabled: !!id },
  );
  const importer = useActionMutation("import-file");
  const [dataset, setDataset] = useState<"payouts" | "bank" | "vendors">(
    "payouts",
  );
  const [step, setStep] = useState<StepName>("parse_number"),
    [params, setParams] = useState(
      JSON.stringify(stepExamples.parse_number, null, 2),
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [download, setDownload] = useState("");
  useEffect(() => {
    void writeClientAppState("rote-selection", { tableId: id || null }).catch(
      () => setError(t("rote.contextError")),
    );
    setDownload("");
  }, [id, t]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("rote.failed"));
    } finally {
      setBusy(false);
    }
  }
  async function sample() {
    await perform(async () => {
      const out = await importer.mutateAsync({
        source: { kind: "sample", dataset, week: 1 },
      });
      setSearch({ table: out.outputTableId });
      setNotice(t("rote.imported"));
    });
  }
  async function transform() {
    await perform(async () => {
      const out = summarySchema.parse(
        await runWorkbenchStep(step, id, JSON.parse(params)),
      );
      await list.refetch();
      setSearch({ table: out.outputTableId });
      setNotice(t("rote.transformed"));
    });
  }
  const data = preview.data;
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("rote.title")}</h1>
        <span className="rounded-full border px-3 py-1 text-xs">
          {t("rote.deterministic")}
        </span>
      </header>
      <section
        className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
        aria-label={t("rote.import")}
      >
        <label className="grid gap-1 text-sm">
          {t("rote.sampleDataset")}
          <select
            aria-label={t("rote.sampleDataset")}
            className="rounded-md border bg-background p-2"
            value={dataset}
            onChange={(e) => setDataset(e.target.value as typeof dataset)}
          >
            <option value="payouts">Sample payouts</option>
            <option value="bank">Sample bank statement</option>
            <option value="vendors">Sample vendor list</option>
          </select>
        </label>
        <Button disabled={busy} onClick={() => void sample()}>
          {t("rote.importSample")}
        </Button>
        <label className="grid gap-1 text-sm">
          {t("rote.upload")}
          <input
            aria-label={t("rote.upload")}
            type="file"
            accept=".csv,.xlsx"
            disabled={busy}
            className="max-w-full text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void perform(async () => {
                  const uploadId = await uploadRoteFile(file);
                  const out = await importer.mutateAsync({
                    source: { kind: "upload", uploadId },
                  });
                  setSearch({ table: out.outputTableId });
                  setNotice(t("rote.imported"));
                });
              e.target.value = "";
            }}
          />
        </label>
      </section>
      {error && (
        <p
          role="alert"
          className="break-words rounded-lg border border-destructive p-3 text-destructive"
        >
          {error}
        </p>
      )}
      {(notice || busy) && (
        <p role="status" className="text-sm text-muted-foreground">
          {busy ? t("rote.working") : notice}
        </p>
      )}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <h2 className="font-medium">{t("rote.tables")}</h2>
          {list.isLoading && <p>{t("rote.loading")}</p>}
          {list.error && <p role="alert">{t("rote.loadError")}</p>}
          {list.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("rote.empty")}</p>
          )}
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {list.data?.map((row) => (
              <button
                key={row.id}
                disabled={busy}
                aria-current={id === row.id ? "true" : undefined}
                className={`w-full break-words rounded-lg border p-3 text-left text-sm focus-visible:outline focus-visible:outline-2 ${id === row.id ? "border-primary bg-muted" : "border-transparent hover:bg-muted"}`}
                onClick={() => setSearch({ table: row.id })}
              >
                <span className="block">{row.name}</span>
                <span className="text-xs text-muted-foreground">
                  {row.rowCount} rows{row.sample ? " · sample" : ""}
                </span>
              </button>
            ))}
          </div>
        </aside>
        <section className="min-w-0 space-y-4">
          {!id ? (
            <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
              {t("rote.start")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="min-w-0 flex-1 break-words font-medium">
                  {data?.name ?? t("rote.loading")}
                </h2>
                <Button
                  variant="outline"
                  disabled={busy || !data}
                  onClick={() =>
                    void perform(async () => {
                      const out = await callAction(
                        "export-table",
                        { inputTableId: id },
                        { method: "GET" },
                      );
                      setDownload(out.downloadUrl);
                    })
                  }
                >
                  {t("rote.export")}
                </Button>
                {download && (
                  <a
                    className="text-sm underline"
                    href={appPath(download)}
                    download
                  >
                    {t("rote.download")}
                  </a>
                )}
              </div>
              {data?.sample && (
                <p className="text-sm text-muted-foreground">
                  {t("rote.sampleLabel")}
                </p>
              )}
              {preview.error && <p role="alert">{t("rote.loadError")}</p>}
              {data && (
                <>
                  <div className="overflow-auto rounded-lg border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {data.columns.map((c) => (
                            <th
                              key={c}
                              className="whitespace-nowrap px-4 py-3 font-medium"
                            >
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((r, i) => (
                          <tr key={i} className="border-t">
                            {data.columns.map((c) => (
                              <td
                                key={c}
                                className="max-w-80 whitespace-pre-wrap break-words px-4 py-2"
                              >
                                {r[c] === null ? (
                                  <span className="text-muted-foreground italic">
                                    null
                                  </span>
                                ) : (
                                  String(r[c])
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("rote.previewNote")} {data.rowCount} rows · ID:{" "}
                    <code>{id}</code>
                  </p>
                </>
              )}
              <details className="rounded-xl border p-4" open>
                <summary className="cursor-pointer font-medium">
                  {t("rote.transform")}
                </summary>
                <div className="mt-4 grid gap-3">
                  <label className="grid gap-1 text-sm">
                    {t("rote.step")}
                    <select
                      aria-label={t("rote.step")}
                      className="rounded-md border bg-background p-2"
                      value={step}
                      onChange={(e) => {
                        const v = e.target.value as StepName;
                        setStep(v);
                        setParams(JSON.stringify(stepExamples[v], null, 2));
                      }}
                    >
                      {stepNames.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    {t("rote.params")}
                    <Textarea
                      aria-label={t("rote.params")}
                      className="min-h-36 font-mono text-xs"
                      value={params}
                      onChange={(e) => setParams(e.target.value)}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t("rote.immutable")}
                  </p>
                  <Button
                    className="justify-self-start"
                    disabled={busy || !data}
                    onClick={() => void transform()}
                  >
                    {t("rote.run")}
                  </Button>
                </div>
              </details>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
