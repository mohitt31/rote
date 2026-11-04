import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { writeClientAppState } from "@agent-native/core/client/application-state";
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import {
  IconCheck,
  IconFlask,
  IconLock,
  IconMessageCircle,
  IconPlayerPlay,
  IconPlus,
  IconShieldCheck,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import { ParameterizePipeline } from "@/components/ParameterizePipeline";
import { PipelineSteps } from "@/components/rote/PipelineSteps";
import { TablePicker, TablePreview } from "@/components/rote/TableBits";
import { VersionDiff } from "@/components/rote/VersionDiff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill, VerificationDiff } from "@/components/VerificationDiff";
import { cn } from "@/lib/utils";

import {
  bindingsSchema,
  parameterValuesSchema,
} from "../../shared/rote/pipeline";

type Binding = { name: string; tableId: string };
type ExampleDraft = {
  inputs: Record<string, string>;
  outputTableId: string | null;
  sourceOutputTableId: string | null;
};
type SampleDraft = {
  taskId: string;
  training: ExampleDraft;
  holdout: ExampleDraft;
  next: ExampleDraft;
};
type Form = {
  inputs: Binding[];
  output: string;
  source: string;
  params: string;
};

const emptyForm = (names: string[] = ["input"]): Form => ({
  inputs: names.map((name) => ({ name, tableId: "" })),
  output: "",
  source: "",
  params: "{}",
});
const fromDraft = (d: ExampleDraft): Form => ({
  inputs: Object.entries(d.inputs).map(([name, tableId]) => ({
    name,
    tableId,
  })),
  output: d.outputTableId ?? "",
  source: d.sourceOutputTableId ?? "",
  params: "{}",
});
const toBindings = (inputs: Binding[]) =>
  bindingsSchema.parse(
    Object.fromEntries(inputs.map((b) => [b.name.trim(), b.tableId])),
  );
const ready = (inputs: Binding[]) =>
  inputs.length > 0 && inputs.every((b) => b.name.trim() && b.tableId);

export function meta() {
  return [{ title: "Rote · Tasks" }];
}

export default function Tasks() {
  const t = useT(),
    [search, setSearch] = useSearchParams(),
    id = search.get("task") ?? "";
  const list = useActionQuery("list-tasks", {}),
    detail = useActionQuery("get-task", { id }, { enabled: !!id });
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [name, setName] = useState(""),
    [draft, setDraft] = useState<SampleDraft | null>(null),
    [training, setTraining] = useState<Form>(emptyForm()),
    [holdout, setHoldout] = useState<Form>(emptyForm()),
    [next, setNext] = useState<Form>(emptyForm()),
    [retrain, setRetrain] = useState(false),
    [retrainForm, setRetrainForm] = useState<Form>(emptyForm()),
    [lastRun, setLastRun] = useState<{
      status: string;
      message: string;
      durationMs: number;
      outputTableId: string | null;
    } | null>(null),
    [fix, setFix] = useState<
      | {
          status: "proposed";
          changes: (
            | { kind: "rename"; input: string; from: string; to: string }
            | {
                kind: "date_format";
                input: string;
                column: string;
                from: string[];
                to: string;
              }
          )[];
          sourceOutputTableId: string;
          rowCount: number;
          durationMs: number;
        }
      | { status: "unsupported" | "no_drift"; reason: string }
      | null
    >(null);

  useEffect(() => {
    void writeClientAppState("rote-task-selection", {
      taskId: id || null,
    }).catch(() => setError(t("rote.contextError")));
    let stored: SampleDraft | null = null;
    try {
      const raw = sessionStorage.getItem(`rote-demo:${id}`);
      stored = raw ? (JSON.parse(raw) as SampleDraft) : null;
    } catch {
      stored = null;
    }
    setDraft(stored);
    setTraining(stored ? fromDraft(stored.training) : emptyForm());
    setHoldout(stored ? fromDraft(stored.holdout) : emptyForm());
    setNext(stored ? fromDraft(stored.next) : emptyForm());
    setLastRun(null);
    setFix(null);
    setRetrain(false);
    setRetrainForm(emptyForm());
    setError("");
    setNotice("");
  }, [id, t]);

  async function perform(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
      await list.refetch();
      if (id) await detail.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("rote.failed"));
    } finally {
      setBusy("");
    }
  }

  const data = detail.data;
  const view = useMemo(() => {
    if (!data) return null;
    // Steps 1–4 follow the newest example generation; step 5 runs the active version.
    const gen = data.generation,
      examples = data.examples.filter((e) => e.generation === gen),
      versions = data.versions.filter((v) => v.generation === gen),
      trainingEx = examples.find((e) => !e.holdout),
      holdoutEx = examples.find((e) => e.holdout),
      latest = versions[0],
      active = data.versions.find((v) => v.id === data.task.currentPipelineId),
      replays = data.runs.filter((r) => r.mode === "pipeline"),
      teach = data.runs.find((r) => r.mode !== "pipeline");
    const done = [
      !!trainingEx && !!holdoutEx,
      versions.length > 0,
      !!latest && ["verified", "approved"].includes(latest.status),
      !!latest && latest.status === "approved",
      replays.some((r) => r.status === "succeeded"),
    ];
    const current = done.findIndex((d) => !d);
    return {
      gen,
      frozen: versions.length > 0,
      trainingEx,
      holdoutEx,
      latest,
      active,
      replays,
      teach,
      done,
      current: current === -1 ? 5 : current,
    };
  }, [data]);

  // Holdout inputs must use the training example's binding names.
  const trainingNames = view?.trainingEx?.inputNames.join("|");
  useEffect(() => {
    if (!trainingNames) return;
    const names = trainingNames.split("|");
    setHoldout((f) =>
      f.inputs.map((b) => b.name).join("|") === trainingNames
        ? f
        : {
            ...f,
            inputs: names.map((n) => ({
              name: n,
              tableId: f.inputs.find((b) => b.name === n)?.tableId ?? "",
            })),
          },
    );
  }, [trainingNames]);

  // Replay inputs follow the active pipeline's named inputs.
  const activeNames = view?.active?.plan.inputs.join("|");
  useEffect(() => {
    if (!activeNames) return;
    const names = activeNames.split("|");
    setNext((f) =>
      f.inputs.map((b) => b.name).join("|") === activeNames
        ? f
        : {
            ...f,
            inputs: names.map((n) => ({
              name: n,
              tableId: f.inputs.find((b) => b.name === n)?.tableId ?? "",
            })),
          },
    );
  }, [activeNames]);

  const prepareSample = (kind: "payouts" | "vendors") =>
    perform(`sample-${kind}`, async () => {
      const result =
        kind === "payouts"
          ? await callAction("prepare-payout-sample", {})
          : await callAction("prepare-vendor-sample", {});
      sessionStorage.setItem(
        `rote-demo:${result.taskId}`,
        JSON.stringify(result),
      );
      setSearch({ task: result.taskId });
      setNotice(t("rote.samplePrepared"));
    });

  return (
    <main className="mx-auto grid max-w-7xl gap-6 p-4 md:grid-cols-[240px_minmax(0,1fr)] md:p-8">
      <aside className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-lg font-semibold">{t("rote.tasksTitle")}</h1>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              void perform("create", async () => {
                const result = await callAction("create-task", {
                  name: name.trim(),
                });
                setName("");
                setSearch({ task: result.id });
              });
            }}
          >
            <Input
              aria-label={t("rote.taskName")}
              placeholder={t("rote.flow.newTaskPlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              type="submit"
              size="icon"
              variant="outline"
              aria-label={t("rote.createTask")}
              disabled={!!busy || !name.trim()}
            >
              <IconPlus className="size-4" />
            </Button>
          </form>
          {(["payouts", "vendors"] as const).map((kind) => (
            <Button
              key={kind}
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground"
              disabled={!!busy}
              onClick={() => void prepareSample(kind)}
            >
              <IconFlask className="size-4" />
              {busy === `sample-${kind}`
                ? t("rote.working")
                : kind === "payouts"
                  ? t("rote.prepareSample")
                  : t("rote.flow.prepareVendors")}
            </Button>
          ))}
        </div>
        <nav className="space-y-1" aria-label={t("rote.tasksTitle")}>
          {list.isLoading && (
            <div className="h-12 animate-pulse rounded-lg bg-muted" />
          )}
          {list.error && (
            <p role="alert" className="text-sm text-destructive">
              {t("rote.loadError")}
            </p>
          )}
          {list.data?.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSearch({ task: task.id })}
              aria-current={task.id === id ? "page" : undefined}
              className={cn(
                "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                task.id === id && "bg-muted",
              )}
            >
              <span className="line-clamp-2">{task.name}</span>
              <span
                className={cn(
                  "mt-1 inline-block text-xs",
                  task.currentPipelineId
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground",
                )}
              >
                {task.currentPipelineId
                  ? t("rote.flow.chipActive")
                  : t("rote.flow.chipSetup")}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="min-w-0 space-y-5">
        {(error || notice) && (
          <p
            role={error ? "alert" : "status"}
            className={cn(
              "break-words rounded-lg border px-3 py-2 text-sm",
              error ? "border-destructive/50 text-destructive" : "bg-muted/40",
            )}
          >
            {error || notice}
          </p>
        )}
        {!id && (
          <EmptyState onSample={(k) => void prepareSample(k)} busy={!!busy} />
        )}
        {id && detail.isLoading && (
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        )}
        {detail.error && (
          <p role="alert" className="text-sm text-destructive">
            {t("rote.loadError")}
          </p>
        )}
        {data && view && (
          <>
            <header className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{data.task.name}</h2>
                {view.active && (
                  <StatusPill
                    ok
                    label={`${t("rote.flow.chipActive")} · v${view.active.version}`}
                  />
                )}
              </div>
              {data.task.description && (
                <p className="text-sm text-muted-foreground">
                  {data.task.description}
                </p>
              )}
            </header>

            <Stepper done={view.done} current={view.current} />

            <Step
              n={1}
              state={stateOf(0, view)}
              title={
                view.gen > 1
                  ? `${t("rote.flow.s1")} · ${t("rote.flow.format")} ${view.gen}`
                  : t("rote.flow.s1")
              }
              hint={t("rote.flow.s1Hint")}
            >
              <div className="grid gap-4">
                <ExampleCard
                  title={t("rote.flow.trainingExample")}
                  approved={view.trainingEx?.inputNames}
                  frozen={view.frozen}
                  form={training}
                  setForm={setTraining}
                  withSource
                  editableNames={!view.trainingEx}
                  busy={busy === "training"}
                  disabled={!!busy}
                  onApprove={() =>
                    perform("training", async () => {
                      await callAction("approve-example", {
                        taskId: id,
                        inputs: toBindings(training.inputs),
                        parameterValues: parameterValuesSchema.parse(
                          JSON.parse(training.params),
                        ),
                        outputTableId: training.output,
                        ...(training.source
                          ? { sourceOutputTableId: training.source }
                          : {}),
                        holdout: false,
                      });
                      setNotice(t("rote.exampleApproved"));
                    })
                  }
                />
                <ExampleCard
                  title={t("rote.flow.holdoutExample")}
                  subtitle={t("rote.flow.holdoutHint")}
                  approved={view.holdoutEx?.inputNames}
                  frozen={view.frozen}
                  form={holdout}
                  setForm={setHoldout}
                  editableNames={false}
                  locked={!view.trainingEx}
                  busy={busy === "holdout"}
                  disabled={!!busy}
                  onApprove={() =>
                    perform("holdout", async () => {
                      await callAction("approve-example", {
                        taskId: id,
                        inputs: toBindings(holdout.inputs),
                        parameterValues: parameterValuesSchema.parse(
                          JSON.parse(holdout.params),
                        ),
                        outputTableId: holdout.output,
                        holdout: true,
                      });
                      setNotice(t("rote.exampleApproved"));
                    })
                  }
                />
              </div>
              {view.frozen && view.active && (
                <div className="mt-4 space-y-3 rounded-lg border border-dashed p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {t("rote.flow.reteachTitle")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("rote.flow.reteachHint")}
                      </p>
                    </div>
                    {!retrain && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRetrain(true)}
                      >
                        {t("rote.flow.reteach")}
                      </Button>
                    )}
                  </div>
                  {retrain && (
                    <>
                      {data.task.name.startsWith("Sample batched payout") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2 text-muted-foreground"
                          disabled={!!busy}
                          onClick={() =>
                            void perform("format", async () => {
                              const r = await callAction(
                                "prepare-format-change-sample",
                                { taskId: id },
                              );
                              sessionStorage.setItem(
                                `rote-demo:${id}`,
                                JSON.stringify(r),
                              );
                              setDraft(r);
                              setRetrainForm(fromDraft(r.training));
                              setHoldout(fromDraft(r.holdout));
                              setNext(fromDraft(r.next));
                              setNotice(t("rote.flow.formatPrepared"));
                            })
                          }
                        >
                          <IconFlask className="size-4" />
                          {busy === "format"
                            ? t("rote.working")
                            : t("rote.flow.prepareFormatChange")}
                        </Button>
                      )}
                      <ExampleCard
                        title={`${t("rote.flow.trainingExample")} · ${t("rote.flow.format")} ${view.gen + 1}`}
                        frozen={false}
                        form={retrainForm}
                        setForm={setRetrainForm}
                        withSource
                        editableNames
                        busy={busy === "retrain"}
                        disabled={!!busy}
                        onApprove={() =>
                          perform("retrain", async () => {
                            await callAction("approve-example", {
                              taskId: id,
                              inputs: toBindings(retrainForm.inputs),
                              parameterValues: parameterValuesSchema.parse(
                                JSON.parse(retrainForm.params),
                              ),
                              outputTableId: retrainForm.output,
                              ...(retrainForm.source
                                ? { sourceOutputTableId: retrainForm.source }
                                : {}),
                              holdout: false,
                              retrain: true,
                            });
                            setRetrain(false);
                            setNotice(t("rote.flow.reteachStarted"));
                          })
                        }
                      />
                    </>
                  )}
                </div>
              )}
            </Step>

            <Step
              n={2}
              state={stateOf(1, view)}
              title={t("rote.flow.s2")}
              hint={t("rote.flow.s2Hint")}
            >
              {view.latest ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    v{view.latest.version} · {view.latest.plan.steps.length}{" "}
                    {t("rote.flow.steps")} · {t("rote.flow.inputs")}:{" "}
                    {view.latest.plan.inputs.join(", ")} ·{" "}
                    <span className="font-mono">
                      {view.latest.hash.slice(0, 12)}
                    </span>
                  </p>
                  <details open={view.current <= 2} className="group space-y-2">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      {t("rote.flow.showSteps")}
                    </summary>
                    <div className="mt-2">
                      <PipelineSteps plan={view.latest.plan} />
                    </div>
                  </details>
                  {data.versions[1] &&
                    data.versions[1].hash !== view.latest.hash && (
                      <VersionDiff
                        from={data.versions[1].plan}
                        to={view.latest.plan}
                        fromVersion={data.versions[1].version}
                        toVersion={view.latest.version}
                      />
                    )}
                  <details className="rounded-lg border px-3 py-2">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      {t("rote.flow.advanced")}
                    </summary>
                    <div className="mt-3 space-y-3">
                      <ParameterizePipeline
                        id={view.latest.id}
                        onDone={() => void detail.refetch()}
                      />
                      <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
                        {JSON.stringify(view.latest.plan, null, 2)}
                      </pre>
                    </div>
                  </details>
                </div>
              ) : (
                <Button
                  className="gap-2"
                  disabled={!!busy || !view.done[0]}
                  onClick={() =>
                    void perform("crystallize", async () => {
                      await callAction("crystallize-task", { taskId: id });
                      setNotice(t("rote.crystallized"));
                    })
                  }
                >
                  <IconSparkles className="size-4" />
                  {busy === "crystallize"
                    ? t("rote.working")
                    : t("rote.crystallize")}
                </Button>
              )}
            </Step>

            <Step
              n={3}
              state={stateOf(2, view)}
              title={t("rote.flow.s3")}
              hint={t("rote.flow.s3Hint")}
            >
              {view.latest && (
                <div className="space-y-4">
                  {["candidate", "verified"].includes(view.latest.status) && (
                    <Button
                      variant={view.latest.verification ? "outline" : "default"}
                      className="gap-2"
                      disabled={!!busy}
                      onClick={() =>
                        void perform("verify", async () => {
                          const r = await callAction("verify-pipeline", {
                            id: view.latest!.id,
                          });
                          setNotice(
                            r.pass
                              ? t("rote.verificationPassed")
                              : t("rote.verificationFailed"),
                          );
                        })
                      }
                    >
                      <IconShieldCheck className="size-4" />
                      {busy === "verify"
                        ? t("rote.working")
                        : view.latest.verification
                          ? t("rote.flow.reverify")
                          : t("rote.verify")}
                    </Button>
                  )}
                  {view.latest.verification && (
                    <VerificationDiff
                      key={view.latest.verification.id}
                      id={view.latest.verification.id}
                      check={view.latest.verification.check}
                    />
                  )}
                </div>
              )}
            </Step>

            <Step
              n={4}
              state={stateOf(3, view)}
              title={t("rote.flow.s4")}
              hint={t("rote.flow.s4Hint")}
            >
              {view.latest && (
                <div className="flex flex-wrap items-center gap-3">
                  {view.latest.status === "approved" ? (
                    <StatusPill
                      ok
                      label={`v${view.latest.version} ${t("rote.flow.isActive")}`}
                    />
                  ) : (
                    <Button
                      className="gap-2"
                      disabled={!!busy || view.latest.status !== "verified"}
                      onClick={() =>
                        void perform("promote", async () => {
                          await callAction("promote-pipeline", {
                            id: view.latest!.id,
                            hash: view.latest!.hash,
                          });
                          setNotice(t("rote.promoted"));
                        })
                      }
                    >
                      <IconCheck className="size-4" />
                      {t("rote.approvePromotion")} v{view.latest.version}
                    </Button>
                  )}
                  <span className="break-all font-mono text-xs text-muted-foreground">
                    sha256 {view.latest.hash}
                  </span>
                  {data.versions.length > 1 && (
                    <ul className="w-full space-y-1 text-xs text-muted-foreground">
                      {data.versions.map((v) => (
                        <li key={v.id} className="flex flex-wrap gap-2">
                          <span className="font-medium text-foreground">
                            v{v.version}
                          </span>
                          <span>{v.status}</span>
                          <span className="font-mono">
                            {v.hash.slice(0, 12)}
                          </span>
                          {v.id === data.task.currentPipelineId && (
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {t("rote.flow.chipActive")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Step>

            <Step
              n={5}
              state={
                view.active ? (view.done[4] ? "done" : "current") : "locked"
              }
              title={t("rote.flow.s5")}
              hint={t("rote.flow.s5Hint")}
            >
              {view.active && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {next.inputs.map((b, i) => (
                      <TablePicker
                        key={b.name}
                        label={b.name}
                        value={b.tableId}
                        disabled={!!busy}
                        onChange={(tableId) =>
                          setNext((f) => ({
                            ...f,
                            inputs: f.inputs.map((x, j) =>
                              j === i ? { ...x, tableId } : x,
                            ),
                          }))
                        }
                      />
                    ))}
                  </div>
                  <ParamsField
                    value={next.params}
                    onChange={(params) => setNext((f) => ({ ...f, params }))}
                  />
                  <Button
                    className="gap-2"
                    disabled={!!busy || !ready(next.inputs)}
                    onClick={() =>
                      void perform("run", async () => {
                        const r = await callAction("run-task", {
                          taskId: id,
                          inputs: toBindings(next.inputs),
                          parameterValues: parameterValuesSchema.parse(
                            JSON.parse(next.params),
                          ),
                        });
                        setLastRun(r);
                        setFix(null);
                      })
                    }
                  >
                    <IconPlayerPlay className="size-4" />
                    {busy === "run" ? t("rote.working") : t("rote.runTask")}
                  </Button>
                  {lastRun && (
                    <div
                      className={cn(
                        "space-y-3 rounded-lg border p-3",
                        lastRun.status === "succeeded"
                          ? "border-emerald-600/40"
                          : "border-amber-600/50",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill
                          ok={lastRun.status === "succeeded"}
                          label={
                            lastRun.status === "succeeded"
                              ? t("rote.flow.replayed")
                              : t("rote.flow.drift")
                          }
                        />
                        <span className="text-sm tabular-nums">
                          0 {t("rote.flow.modelTokens")} ·{" "}
                          {lastRun.durationMs.toFixed(1)} ms
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {lastRun.status === "succeeded"
                          ? lastRun.message
                          : `${lastRun.message}. ${t("rote.flow.driftHelp")}`}
                      </p>
                      {lastRun.outputTableId && (
                        <TablePreview id={lastRun.outputTableId} />
                      )}
                      {lastRun.status !== "succeeded" && (
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={() =>
                            sendToAgentChat({
                              message: `This week's input stopped the approved "${data.task.name}" pipeline: ${lastRun.message}. First call propose-drift-fix with the task ID and these inputs; it explains renamed columns and changed date formats without a model. If it proposes a fix, report the changes and its output table. Only if it is unsupported, inspect the input tables and redo the job with the Rote step actions so every step is recorded. Do not change the approved pipeline, frozen references or tolerances. Finish by telling me which output table to review.`,
                              context: JSON.stringify({
                                taskId: id,
                                pipelineVersion: view.active?.version,
                                inputs: toBindings(next.inputs),
                                stopReason: lastRun.message,
                              }),
                              contextLabel: t("rote.flow.driftContext"),
                              submit: false,
                              openSidebar: true,
                            })
                          }
                        >
                          <IconMessageCircle className="size-4" />
                          {t("rote.flow.askAgent")}
                        </Button>
                      )}
                      {lastRun.status !== "succeeded" && (
                        <Button
                          className="gap-2"
                          disabled={!!busy}
                          onClick={() =>
                            void perform("fix", async () => {
                              setFix(
                                await callAction("propose-drift-fix", {
                                  taskId: id,
                                  inputs: toBindings(next.inputs),
                                }),
                              );
                            })
                          }
                        >
                          <IconFlask className="size-4" />
                          {busy === "fix"
                            ? t("rote.working")
                            : t("rote.flow.suggestFix")}
                        </Button>
                      )}
                      {lastRun.status !== "succeeded" && fix && (
                        <div className="space-y-2 rounded-md border border-dashed p-3">
                          {fix.status === "proposed" ? (
                            <>
                              <p className="text-sm">
                                {t("rote.flow.fixProposed")}
                              </p>
                              <ul className="space-y-1 text-sm">
                                {fix.changes.map((c, i) => (
                                  <li key={i} className="font-mono text-xs">
                                    {c.kind === "rename"
                                      ? `${t("rote.flow.fixRename")} · ${c.input}: ${c.from} → ${c.to}`
                                      : `${t("rote.flow.fixDate")} · ${c.input}.${c.column}: ${c.from.join(", ")} → ${c.to}`}
                                  </li>
                                ))}
                              </ul>
                              <p className="text-xs tabular-nums text-muted-foreground">
                                0 {t("rote.flow.fixModelCalls")} ·{" "}
                                {fix.durationMs.toFixed(1)} ms · {fix.rowCount}{" "}
                                rows
                              </p>
                              <TablePreview id={fix.sourceOutputTableId} />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setRetrainForm({
                                    inputs: next.inputs.map((b) => ({ ...b })),
                                    output: fix.sourceOutputTableId,
                                    source: fix.sourceOutputTableId,
                                    params: "{}",
                                  });
                                  setRetrain(true);
                                  document
                                    .getElementById("step-1")
                                    ?.scrollIntoView({ behavior: "smooth" });
                                }}
                              >
                                {t("rote.flow.fixUse")}
                              </Button>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {t("rote.flow.fixUnsupported")}: {fix.reason}
                            </p>
                          )}
                        </div>
                      )}
                      {lastRun.status !== "succeeded" && (
                        <Button
                          variant="ghost"
                          className="gap-2"
                          onClick={() => {
                            setRetrain(true);
                            document
                              .getElementById("step-1")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          {t("rote.flow.reteach")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Step>

            {view.active && (
              <Metrics teach={view.teach} replays={view.replays} />
            )}
          </>
        )}
      </section>
    </main>
  );
}

type View = { done: boolean[]; current: number };
const stateOf = (i: number, v: View) =>
  v.done[i] ? "done" : v.current === i ? "current" : "locked";

function Stepper({ done, current }: { done: boolean[]; current: number }) {
  const t = useT();
  const labels = [
    t("rote.flow.s1Short"),
    t("rote.flow.s2Short"),
    t("rote.flow.s3Short"),
    t("rote.flow.s4Short"),
    t("rote.flow.s5Short"),
  ];
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label={t("rote.flow.progress")}>
      {labels.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? "step" : undefined}
          className="min-w-0 space-y-1.5"
        >
          <div
            className={cn(
              "h-1 rounded-full",
              done[i]
                ? "bg-emerald-600"
                : i === current
                  ? "bg-foreground"
                  : "bg-muted",
            )}
          />
          <p
            className={cn(
              "truncate text-xs",
              i === current ? "font-medium" : "text-muted-foreground",
            )}
          >
            {i + 1}. {label}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Step({
  n,
  state,
  title,
  hint,
  children,
}: {
  n: number;
  state: "done" | "current" | "locked";
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`step-${n}`}
      className={cn(
        "rounded-xl border p-4 md:p-5",
        state === "current" && "border-foreground/30 shadow-sm",
        state === "locked" && "opacity-60",
      )}
    >
      <div className="mb-3 flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
            state === "done"
              ? "bg-emerald-600 text-white"
              : state === "current"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground",
          )}
        >
          {state === "done" ? (
            <IconCheck className="size-3.5" strokeWidth={2.5} />
          ) : state === "locked" ? (
            <IconLock className="size-3" />
          ) : (
            n
          )}
        </span>
        <div className="min-w-0">
          <h3 id={`step-${n}`} className="font-medium">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      {state !== "locked" && <div className="md:pl-9">{children}</div>}
    </section>
  );
}

function ParamsField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted-foreground">
        {t("rote.parameterValues")}
      </summary>
      <label className="mt-2 grid gap-1 text-xs text-muted-foreground">
        {t("rote.parameterValuesHelp")}
        <Textarea
          className="min-h-16 font-mono text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </details>
  );
}

function ExampleCard({
  title,
  subtitle,
  approved,
  frozen,
  form,
  setForm,
  withSource,
  editableNames,
  locked,
  busy,
  disabled,
  onApprove,
}: {
  title: string;
  subtitle?: string;
  approved?: string[] | undefined;
  frozen: boolean;
  form: Form;
  setForm: (f: Form | ((f: Form) => Form)) => void;
  withSource?: boolean;
  editableNames: boolean;
  locked?: boolean;
  busy: boolean;
  disabled: boolean;
  onApprove: () => void;
}) {
  const t = useT();
  if (approved)
    return (
      <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{title}</p>
          <StatusPill
            ok
            label={frozen ? t("rote.flow.frozen") : t("rote.flow.approved")}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("rote.flow.inputs")}: {approved.join(", ")}
        </p>
      </div>
    );
  const update = (i: number, patch: Partial<Binding>) =>
    setForm((f) => ({
      ...f,
      inputs: f.inputs.map((b, j) => (j === i ? { ...b, ...patch } : b)),
    }));
  return (
    <div className="min-w-0 space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {locked ? (
        <p className="text-sm text-muted-foreground">
          {t("rote.flow.trainingFirst")}
        </p>
      ) : (
        <>
          {form.inputs.map((b, i) => (
            <div key={i} className="flex items-end gap-2">
              {editableNames && (
                <label className="grid w-28 shrink-0 gap-1 text-sm">
                  <span className="text-muted-foreground">
                    {t("rote.flow.inputName")}
                  </span>
                  <Input
                    value={b.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                </label>
              )}
              <div className="min-w-0 flex-1">
                <TablePicker
                  label={editableNames ? t("rote.flow.table") : b.name}
                  value={b.tableId}
                  onChange={(tableId) => update(i, { tableId })}
                  disabled={disabled}
                />
              </div>
              {editableNames && form.inputs.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("rote.flow.removeInput")}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      inputs: f.inputs.filter((_, j) => j !== i),
                    }))
                  }
                >
                  <IconTrash className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {editableNames && form.inputs.length < 10 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  inputs: [
                    ...f.inputs,
                    { name: `input_${f.inputs.length + 1}`, tableId: "" },
                  ],
                }))
              }
            >
              <IconPlus className="size-3.5" />
              {t("rote.flow.addInput")}
            </Button>
          )}
          <TablePicker
            label={t("rote.flow.reference")}
            value={form.output}
            onChange={(output) => setForm((f) => ({ ...f, output }))}
            disabled={disabled}
          />
          {form.output && <TablePreview id={form.output} rows={5} />}
          {withSource && (
            <TablePicker
              label={t("rote.flow.source")}
              value={form.source}
              onChange={(source) => setForm((f) => ({ ...f, source }))}
              disabled={disabled}
            />
          )}
          <ParamsField
            value={form.params}
            onChange={(params) => setForm((f) => ({ ...f, params }))}
          />
          <Button
            className="w-full gap-2 sm:w-auto"
            disabled={disabled || frozen || !form.output || !ready(form.inputs)}
            onClick={onApprove}
          >
            <IconCheck className="size-4" />
            {busy ? t("rote.working") : t("rote.approveExample")}
          </Button>
        </>
      )}
    </div>
  );
}

type Run = {
  id: string;
  mode: string;
  status: string;
  tokensIn: number | null;
  tokensOut: number | null;
  cost: number | null;
  durationMs: number | null;
  outputTableId: string | null;
};

function Metrics({
  teach,
  replays,
}: {
  teach?: Run | undefined;
  replays: Run[];
}) {
  const t = useT();
  const ok = replays.filter((r) => r.status === "succeeded");
  const ms = ok
    .map((r) => r.durationMs)
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  const median = ms.length ? ms[Math.floor((ms.length - 1) / 2)]! : null;
  const measured = teach && teach.mode === "agent" && teach.tokensIn !== null;
  const teachMs = measured ? teach.durationMs : null;
  return (
    <section className="space-y-4 rounded-xl border p-4 md:p-5">
      <h3 className="font-medium">{t("rote.flow.metrics")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            {t("rote.flow.teachRun")}
          </p>
          {measured ? (
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {(teach.tokensIn! + (teach.tokensOut ?? 0)).toLocaleString()}{" "}
              <span className="text-sm font-normal">tokens</span>
              {teachMs !== null && (
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  · {(teachMs / 1000).toFixed(1)} s
                </span>
              )}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("rote.flow.notMeasured")}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-emerald-500/10 p-3">
          <p className="text-xs text-muted-foreground">
            {t("rote.flow.replayRun")}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            0 <span className="text-sm font-normal">tokens</span>
            {median !== null && (
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                · {median.toFixed(1)} ms {t("rote.flow.median")} ({ms.length})
              </span>
            )}
          </p>
        </div>
      </div>
      {replays.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-normal">
                  {t("rote.flow.status")}
                </th>
                <th className="py-1 pr-3 font-normal">tokens</th>
                <th className="py-1 pr-3 font-normal">ms</th>
                <th className="py-1 font-normal" />
              </tr>
            </thead>
            <tbody>
              {replays.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-1.5 pr-3">
                    {r.status === "succeeded"
                      ? t("rote.flow.replayed")
                      : t("rote.flow.drift")}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {r.tokensIn === null
                      ? "—"
                      : r.tokensIn + (r.tokensOut ?? 0)}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {r.durationMs?.toFixed(1) ?? "—"}
                  </td>
                  <td className="py-1.5 text-right">
                    {r.outputTableId && (
                      <Link
                        className="text-xs underline"
                        to={`/workbench?table=${encodeURIComponent(r.outputTableId)}`}
                      >
                        {t("rote.reviewOutput")}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmptyState({
  onSample,
  busy,
}: {
  onSample: (kind: "payouts" | "vendors") => void;
  busy: boolean;
}) {
  const t = useT();
  const steps = [
    t("rote.flow.s1"),
    t("rote.flow.s2"),
    t("rote.flow.s3"),
    t("rote.flow.s4"),
    t("rote.flow.s5"),
  ];
  return (
    <div className="space-y-5 rounded-xl border p-6 md:p-8">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{t("rote.flow.emptyTitle")}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("rote.flow.emptyBody")}
        </p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s} className="rounded-lg bg-muted/40 p-3 text-sm">
            <span className="block text-xs text-muted-foreground">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          className="gap-2"
          disabled={busy}
          onClick={() => onSample("payouts")}
        >
          <IconFlask className="size-4" />
          {t("rote.prepareSample")}
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          disabled={busy}
          onClick={() => onSample("vendors")}
        >
          <IconFlask className="size-4" />
          {t("rote.flow.prepareVendors")}
        </Button>
      </div>
    </div>
  );
}
