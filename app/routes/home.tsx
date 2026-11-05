import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import {
  IconArrowRight,
  IconMessageCircle,
  IconPlayerPlay,
  IconShieldCheck,
  IconSparkles,
} from "@tabler/icons-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import live from "../../benchmark/live-acceptance.json";
import benchmark from "../../benchmark/results.json";

const fmt = (n: number) => n.toLocaleString("en-US");

/** One click to a prepared sample task, plus agent prompts that show restraint. */
function StartHere() {
  const t = useT();
  const navigate = useNavigate();
  const demo = useActionQuery("get-demo-status", {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await callAction("prepare-payout-sample", {});
      try {
        sessionStorage.setItem(
          `rote-demo:${result.taskId}`,
          JSON.stringify(result),
        );
        sessionStorage.setItem("rote-demo:last", result.taskId);
      } catch {
        // Storage can be unavailable; the Tasks screen still loads the task.
      }
      navigate(`/tasks?task=${encodeURIComponent(result.taskId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("rote.loadError"));
      setBusy(false);
    }
  };
  const agentOff = demo.data?.publicDemo && !demo.data.agent;
  // When this browser prepared a task, hand the agent its exact IDs so the
  // request needs one or two tool calls instead of a search.
  const ask = (kind: "run" | "drift" | "restraint") => {
    let last: { taskId: string; next?: { inputs: Record<string, string> } } | null =
      null;
    try {
      const id = sessionStorage.getItem("rote-demo:last");
      const raw = id ? sessionStorage.getItem(`rote-demo:${id}`) : null;
      last = id && raw ? { ...JSON.parse(raw), taskId: id } : null;
    } catch {
      last = null;
    }
    const exact = kind !== "restraint" && last?.next?.inputs;
    sendToAgentChat({
      message: exact
        ? t(`rote.home.ask.${kind}Exact`)
        : t(`rote.home.ask.${kind}Prompt`),
      ...(exact
        ? {
            context: JSON.stringify({
              taskId: last!.taskId,
              nextInputs: last!.next!.inputs,
            }),
            contextLabel: t("rote.home.ask.contextLabel"),
          }
        : {}),
      // Submit directly: a prefill sent while the sidebar is still mounting
      // was dropped on the first click, leaving an empty composer.
      submit: true,
      openSidebar: true,
    });
  };
  return (
    <section
      aria-labelledby="start-here"
      className="grid gap-4 rounded-2xl border bg-muted/30 p-5 md:grid-cols-[1.1fr_1fr]"
    >
      <div className="space-y-3">
        <h2 id="start-here" className="text-lg font-semibold">
          {t("rote.home.start.title")}
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("rote.home.start.s1")}</li>
          <li>{t("rote.home.start.s2")}</li>
          <li>{t("rote.home.start.s3")}</li>
        </ol>
        <Button className="gap-2" onClick={start} disabled={busy}>
          <IconPlayerPlay className="size-4" />
          {busy ? t("rote.home.start.busy") : t("rote.home.start.button")}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("rote.home.ask.title")}</p>
        {agentOff ? (
          <p className="text-sm text-muted-foreground">{t("rote.home.ask.off")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {(["run", "drift", "restraint"] as const).map((k) => (
              <Button
                key={k}
                variant="outline"
                className="h-auto justify-start gap-2 whitespace-normal py-2 text-left"
                onClick={() => ask(k)}
              >
                <IconMessageCircle className="size-4 shrink-0" />
                {t(`rote.home.ask.${k}`)}
              </Button>
            ))}
            <p className="text-xs text-muted-foreground">
              {t("rote.home.ask.note")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/** One recorded live run: the agent teaching the job vs. the approved replay. */
function LiveComparison() {
  const t = useT();
  const agentTokens = live.agent.tokensIn + live.agent.tokensOut;
  const speedup = Math.round(live.agent.durationMs / live.replay.durationMs);
  const row = (
    label: string,
    time: string,
    tokens: string,
    calls: string,
    accent?: boolean,
  ) => (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl border p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-baseline",
        accent && "border-emerald-600/30 bg-emerald-500/5",
      )}
    >
      <p className="col-span-2 text-sm font-medium sm:col-span-1">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{time}</p>
      <p className="text-right text-sm tabular-nums text-muted-foreground sm:text-left">
        {tokens} {t("rote.home.live.tokens")}
      </p>
      <p className="hidden text-sm tabular-nums text-muted-foreground sm:block">
        {calls} {t("rote.home.live.calls")}
      </p>
    </div>
  );
  return (
    <section className="space-y-3" aria-labelledby="live-run">
      <div>
        <h2 id="live-run" className="font-medium">
          {t("rote.home.live.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("rote.home.live.body")}
        </p>
      </div>
      <div className="space-y-2">
        {row(
          t("rote.home.live.agent"),
          `${(live.agent.durationMs / 1000).toFixed(1)} s`,
          fmt(agentTokens),
          String(live.agent.modelCalls),
        )}
        {row(
          t("rote.home.live.replay"),
          `${live.replay.durationMs} ms`,
          "0",
          "0",
          true,
        )}
        {row(
          t("rote.home.live.fix"),
          `${live.drift.fixMs} ms`,
          "0",
          "0",
          true,
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("rote.home.live.note", {
          speedup: fmt(speedup),
          date: live.date,
        })}
      </p>
    </section>
  );
}

const TITLE = "Rote · Teach it once. Never pay for it again.";
const DESCRIPTION =
  "Rote turns a repetitive agent data job into a verified, versioned pipeline that replays with zero model calls and stops when the input changes.";

export function meta() {
  return [
    { title: TITLE },
    { name: "description", content: DESCRIPTION },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: DESCRIPTION },
  ];
}

type BenchTask = {
  label: string;
  replay: {
    weeks: number;
    matchesIndependentReference: number;
    medianMs: number;
    p95Ms: number;
  };
  drift: { cases: number; stoppedWithoutOutput: number };
};

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        accent && "border-emerald-600/30 bg-emerald-500/5",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function HomeRoute() {
  const t = useT();
  const overview = useActionQuery("get-overview", {});
  const restraint = useActionQuery("get-restraint-report", {});
  const groups = restraint.data?.groups ?? [];
  const tasks = overview.data?.tasks ?? [];
  const active = tasks.filter((x) => x.activeVersion !== null).length;
  const replays = tasks.reduce((n, x) => n + x.replays, 0);
  const replayTokens = tasks.reduce((n, x) => n + x.replayTokens, 0);
  const drift = tasks.reduce((n, x) => n + x.driftStops, 0);
  const bench = (benchmark as { tasks: BenchTask[]; date: string }).tasks;

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold md:text-3xl">
          {t("rote.home.title")}
        </h1>
        <p className="max-w-2xl text-muted-foreground">{t("rote.home.body")}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild className="gap-2">
            <Link to="/tasks">
              {t("rote.home.open")}
              <IconArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/workbench">{t("rote.title")}</Link>
          </Button>
        </div>
      </header>

      <StartHere />

      <LiveComparison />

      <ol className="grid gap-3 md:grid-cols-3">
        {[
          [IconSparkles, t("rote.home.step1"), t("rote.home.step1Body")],
          [IconShieldCheck, t("rote.home.step2"), t("rote.home.step2Body")],
          [IconPlayerPlay, t("rote.home.step3"), t("rote.home.step3Body")],
        ].map(([Icon, title, body], i) => {
          const I = Icon as typeof IconSparkles;
          return (
            <li key={i} className="space-y-1.5 rounded-xl bg-muted/40 p-4">
              <I className="size-5 text-muted-foreground" strokeWidth={1.8} />
              <p className="font-medium">{title as string}</p>
              <p className="text-sm text-muted-foreground">{body as string}</p>
            </li>
          );
        })}
      </ol>

      <section className="space-y-3" aria-labelledby="your-tasks">
        <h2 id="your-tasks" className="font-medium">
          {t("rote.home.yourTasks")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label={t("rote.home.active")} value={String(active)} />
          <Stat label={t("rote.home.replays")} value={String(replays)} />
          <Stat
            label={t("rote.home.replayTokens")}
            value={String(replayTokens)}
            accent
          />
          <Stat label={t("rote.home.driftStops")} value={String(drift)} />
        </div>
        {overview.isLoading && (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        )}
        {overview.error && (
          <p role="alert" className="text-sm text-destructive">
            {t("rote.loadError")}
          </p>
        )}
        {overview.data && tasks.length === 0 && (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            {t("rote.home.empty")}{" "}
            <Link className="underline" to="/tasks">
              {t("rote.home.open")}
            </Link>
          </div>
        )}
        {tasks.length > 0 && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">
                    {t("rote.home.task")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("rote.home.version")}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {t("rote.home.replays")}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {t("rote.home.median")}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {t("rote.home.driftStops")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((x) => (
                  <tr key={x.id} className="border-t">
                    <td className="px-4 py-2">
                      <Link
                        className="hover:underline"
                        to={`/tasks?task=${encodeURIComponent(x.id)}`}
                      >
                        {x.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {x.activeVersion !== null
                        ? `v${x.activeVersion}`
                        : t("rote.flow.chipSetup")}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {x.replays}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {x.medianReplayMs !== null
                        ? `${x.medianReplayMs.toFixed(1)} ms`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {x.driftStops}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="restraint">
        <div>
          <h2 id="restraint" className="font-medium">
            {t("rote.restraint.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("rote.restraint.body")}
          </p>
        </div>
        {restraint.isLoading && (
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
        )}
        {restraint.data && groups.length === 0 && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {t("rote.restraint.empty")}
          </p>
        )}
        {groups.length > 0 && (
          <ul className="space-y-2">
            {groups.slice(0, 5).map((g) => (
              <li key={g.signature} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">
                    {g.steps} {t("rote.restraint.steps")} ·{" "}
                    {g.agentRuns} {t("rote.restraint.runs")}
                  </p>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {(g.tokensIn + g.tokensOut).toLocaleString("en-US")}{" "}
                    {t("rote.restraint.tokens")} ·{" "}
                    {(g.agentMs / 1000).toFixed(1)} s{" "}
                    {t("rote.restraint.time")}
                  </p>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {Object.entries(g.actions)
                    .map(([a, n]) => (n > 1 ? `${a} ×${n}` : a))
                    .join(" · ")}
                </p>
                <p className="mt-2 text-sm">
                  {g.coveredBy.length > 0 ? (
                    <>
                      {t("rote.restraint.covered")}{" "}
                      {g.coveredBy.map((c, i) => (
                        <Link
                          key={c.taskId + c.version}
                          className="underline"
                          to={`/tasks?task=${encodeURIComponent(c.taskId)}`}
                        >
                          {i > 0 ? ", " : ""}
                          {c.taskName} v{c.version}
                        </Link>
                      ))}
                    </>
                  ) : (
                    <>
                      {t("rote.restraint.crystallize")} ·{" "}
                      <Link className="underline" to="/tasks">
                        {t("rote.restraint.open")}
                      </Link>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="measured">
        <div>
          <h2 id="measured" className="font-medium">
            {t("rote.home.measured")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("rote.home.measuredBody")}
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t("rote.home.task")}</th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("rote.home.correct")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("rote.home.medianP95")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("rote.home.tokens")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("rote.home.driftStops")}
                </th>
              </tr>
            </thead>
            <tbody>
              {bench.map((b) => (
                <tr key={b.label} className="border-t">
                  <td className="px-4 py-2">{b.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {b.replay.matchesIndependentReference}/{b.replay.weeks}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {b.replay.medianMs.toFixed(1)} / {b.replay.p95Ms.toFixed(1)}{" "}
                    ms
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">0</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {b.drift.stoppedWithoutOutput}/{b.drift.cases}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">{t("rote.home.honest")}</p>
      </section>
    </main>
  );
}
