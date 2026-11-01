import { useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import {
  IconArrowRight,
  IconPlayerPlay,
  IconShieldCheck,
  IconSparkles,
} from "@tabler/icons-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import benchmark from "../../benchmark/results.json";

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
