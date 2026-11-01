import { writeClientAppState } from "@agent-native/core/client/application-state";
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { ParameterizePipeline } from "@/components/ParameterizePipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VerificationDiff } from "@/components/VerificationDiff";

import {
  bindingsSchema,
  parameterValuesSchema,
} from "../../shared/rote/pipeline";
type Draft = {
  taskId: string;
  training: {
    inputs: Record<string, string>;
    outputTableId: string | null;
    sourceOutputTableId: string | null;
  };
  holdout: {
    inputs: Record<string, string>;
    outputTableId: string | null;
    sourceOutputTableId: string | null;
  };
  next: {
    inputs: Record<string, string>;
    outputTableId: string | null;
    sourceOutputTableId: string | null;
  };
};
export function meta() {
  return [{ title: "Rote · Tasks" }];
}
export default function Tasks() {
  const t = useT(),
    [search, setSearch] = useSearchParams(),
    id = search.get("task") ?? "";
  const list = useActionQuery("list-tasks", {}),
    detail = useActionQuery("get-task", { id }, { enabled: !!id });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [name, setName] = useState(""),
    [inputs, setInputs] = useState("{}"),
    [parameterValues, setParameterValues] = useState("{}"),
    [output, setOutput] = useState(""),
    [source, setSource] = useState(""),
    [holdout, setHoldout] = useState(false),
    [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    void writeClientAppState("rote-task-selection", {
      taskId: id || null,
    }).catch(() => setError(t("rote.contextError")));
    const stored = sessionStorage.getItem(`rote-demo:${id}`);
    try {
      setDraft(stored ? JSON.parse(stored) : null);
    } catch {
      setDraft(null);
    }
  }, [id, t]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await list.refetch();
      if (id) await detail.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  function load(which: "training" | "holdout" | "next") {
    if (!draft) return;
    const e = draft[which];
    setInputs(JSON.stringify(e.inputs, null, 2));
    setOutput(e.outputTableId ?? "");
    setSource(e.sourceOutputTableId ?? "");
    setHoldout(which === "holdout");
    setParameterValues("{}");
  }
  const data = detail.data;
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">{t("rote.tasksTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("rote.tasksSubtitle")}
        </p>
      </header>
      <section className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <label className="grid gap-1 text-sm">
          {t("rote.taskName")}
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button
          disabled={busy || !name.trim()}
          onClick={() =>
            void perform(async () => {
              const result = await callAction("create-task", {
                name: name.trim(),
              });
              setSearch({ task: result.id });
            })
          }
        >
          {t("rote.createTask")}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const result = await callAction("prepare-payout-sample", {});
              sessionStorage.setItem(
                `rote-demo:${result.taskId}`,
                JSON.stringify(result),
              );
              setDraft(result);
              setSearch({ task: result.taskId });
              setNotice(t("rote.samplePrepared"));
            })
          }
        >
          {t("rote.prepareSample")}
        </Button>
      </section>
      {busy && <p role="status">{t("rote.working")}</p>}
      {error && (
        <p
          role="alert"
          className="break-words rounded-lg border border-destructive p-3 text-destructive"
        >
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="grid gap-6 md:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {list.isLoading && <p>{t("rote.loading")}</p>}
          {list.error && <p role="alert">{t("rote.loadError")}</p>}
          {list.data?.map((task) => (
            <button
              key={task.id}
              disabled={busy}
              onClick={() => setSearch({ task: task.id })}
              aria-current={task.id === id ? "page" : undefined}
              className={`w-full rounded-lg border p-3 text-left text-sm ${task.id === id ? "bg-muted" : ""}`}
            >
              {task.name}
              <span className="block text-xs text-muted-foreground">
                {task.currentPipelineId
                  ? t("rote.activePipeline")
                  : t("rote.needsApproval")}
              </span>
            </button>
          ))}
        </aside>
        <section className="min-w-0 space-y-5">
          {detail.error && <p role="alert">{t("rote.loadError")}</p>}
          {!id && <p>{t("rote.chooseTask")}</p>}
          {data && (
            <>
              <h2 className="text-lg font-medium">{data.task.name}</h2>
              <p className="text-sm text-muted-foreground">
                {data.task.description}
              </p>
              {draft && (
                <div className="flex flex-wrap gap-2 rounded-lg border p-3">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => load("training")}
                  >
                    {t("rote.loadTraining")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => load("holdout")}
                  >
                    {t("rote.loadHoldout")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => load("next")}
                  >
                    {t("rote.loadNext")}
                  </Button>
                </div>
              )}
              <div className="space-y-3 rounded-xl border p-4">
                <h3 className="font-medium">{t("rote.exampleHeading")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("rote.exampleHelp")}
                </p>
                <label className="grid gap-1 text-sm">
                  {t("rote.inputBindings")}
                  <Textarea
                    className="min-h-28 font-mono text-xs"
                    value={inputs}
                    onChange={(e) => setInputs(e.target.value)}
                  />
                </label>
                <details>
                  <summary className="cursor-pointer text-sm">
                    {t("rote.parameterValues")}
                  </summary>
                  <label className="mt-2 grid gap-1 text-sm">
                    {t("rote.parameterValuesHelp")}
                    <Textarea
                      className="font-mono text-xs"
                      value={parameterValues}
                      onChange={(e) => setParameterValues(e.target.value)}
                    />
                  </label>
                </details>
                <label className="grid gap-1 text-sm">
                  {t("rote.referenceOutput")}
                  <Input
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                  />
                </label>
                {output && (
                  <Link
                    target="_blank"
                    rel="noreferrer"
                    className="block text-sm underline"
                    to={`/workbench?table=${encodeURIComponent(output)}`}
                  >
                    {t("rote.reviewOutput")}
                  </Link>
                )}
                <label className="grid gap-1 text-sm">
                  {t("rote.sourceOutput")}
                  <Input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={holdout}
                    onChange={(e) => setHoldout(e.target.checked)}
                  />
                  {t("rote.holdout")}
                </label>
                <Button
                  disabled={busy || !!data.versions.length || !output}
                  onClick={() =>
                    void perform(async () => {
                      await callAction("approve-example", {
                        taskId: id,
                        inputs: bindingsSchema.parse(JSON.parse(inputs)),
                        parameterValues: parameterValuesSchema.parse(
                          JSON.parse(parameterValues),
                        ),
                        outputTableId: output,
                        ...(source ? { sourceOutputTableId: source } : {}),
                        holdout,
                      });
                      setNotice(t("rote.exampleApproved"));
                    })
                  }
                >
                  {t("rote.approveExample")}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {data.examples.filter((e) => !e.holdout).length} training ·{" "}
                  {data.examples.filter((e) => e.holdout).length} holdout
                </p>
              </div>
              <Button
                disabled={
                  busy ||
                  !data.examples.some((e) => e.holdout) ||
                  !data.examples.some((e) => !e.holdout)
                }
                onClick={() =>
                  void perform(async () => {
                    await callAction("crystallize-task", { taskId: id });
                    setNotice(t("rote.crystallized"));
                  })
                }
              >
                {t("rote.crystallize")}
              </Button>
              {data.versions.map((v) => (
                <article key={v.id} className="space-y-3 rounded-xl border p-4">
                  <h3 className="font-medium">
                    v{v.version} · {v.status}
                  </h3>
                  <p className="break-all font-mono text-xs">
                    SHA-256 {v.hash}
                  </p>
                  <ol className="list-inside list-decimal text-sm">
                    {v.plan.steps.map((step, i) => (
                      <li key={i}>
                        {step.action} ← {step.input}
                        {step.right ? ` + ${step.right}` : ""}
                      </li>
                    ))}
                  </ol>
                  <details>
                    <summary className="cursor-pointer text-sm">
                      {t("rote.pipelineDetails")}
                    </summary>
                    <pre className="max-h-64 overflow-auto text-xs">
                      {JSON.stringify(v.plan, null, 2)}
                    </pre>
                  </details>
                  {v.verification && (
                    <pre className="max-h-52 overflow-auto rounded bg-muted p-3 text-xs">
                      {JSON.stringify(v.verification, null, 2)}
                    </pre>
                  )}
                  <ParameterizePipeline
                    id={v.id}
                    onDone={() => {
                      void detail.refetch();
                    }}
                  />
                  {v.verification && (
                    <VerificationDiff id={v.verification.id} />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={
                        busy || !["candidate", "verified"].includes(v.status)
                      }
                      onClick={() =>
                        void perform(async () => {
                          const r = await callAction("verify-pipeline", {
                            id: v.id,
                          });
                          setNotice(
                            r.pass
                              ? t("rote.verificationPassed")
                              : t("rote.verificationFailed"),
                          );
                        })
                      }
                    >
                      {t("rote.verify")}
                    </Button>
                    <Button
                      disabled={busy || v.status !== "verified"}
                      onClick={() =>
                        void perform(async () => {
                          await callAction("promote-pipeline", {
                            id: v.id,
                            hash: v.hash,
                          });
                          setNotice(t("rote.promoted"));
                        })
                      }
                    >
                      {t("rote.approvePromotion")} v{v.version}
                    </Button>
                  </div>
                </article>
              ))}
              <div className="space-y-3 rounded-xl border p-4">
                <h3 className="font-medium">{t("rote.replay")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("rote.replayHelp")}
                </p>
                <Button
                  disabled={busy || !data.task.currentPipelineId}
                  onClick={() =>
                    void perform(async () => {
                      const r = await callAction("run-task", {
                        taskId: id,
                        inputs: bindingsSchema.parse(JSON.parse(inputs)),
                        parameterValues: parameterValuesSchema.parse(
                          JSON.parse(parameterValues),
                        ),
                      });
                      setNotice(`${r.message} · ${r.durationMs.toFixed(1)} ms`);
                    })
                  }
                >
                  {t("rote.runTask")}
                </Button>
                {data.runs.map((run) => (
                  <div key={run.id} className="rounded border p-3 text-sm">
                    {run.mode} · {run.status} ·{" "}
                    {run.tokensIn === null
                      ? "tokens not measured"
                      : `${run.tokensIn + (run.tokensOut ?? 0)} tokens`}
                    {run.durationMs !== null
                      ? ` · ${run.durationMs.toFixed(1)} ms`
                      : ""}
                    {run.outputTableId && (
                      <Link
                        className="ml-3 underline"
                        to={`/workbench?table=${run.outputTableId}`}
                      >
                        {t("rote.reviewOutput")}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
