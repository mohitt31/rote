import { useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { IconCheck, IconX } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

import { RowsTable } from "./rote/TableBits";

type Cell = string | number | boolean | null;
type Diff = {
  exampleId: string;
  holdout: boolean;
  pass?: boolean;
  error?: string;
  columnsMatch?: boolean;
  missing?: Record<string, Cell>[];
  unexpected?: Record<string, Cell>[];
  missingCount?: number;
  unexpectedCount?: number;
};
type Check = {
  exampleId: string;
  pass: boolean;
  identical: boolean;
  changedRejected: boolean;
  droppedRejected: boolean;
};

export function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        ok
          ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-400",
      )}
    >
      {ok ? (
        <IconCheck className="size-3" strokeWidth={2.5} />
      ) : (
        <IconX className="size-3" strokeWidth={2.5} />
      )}
      {label}
    </span>
  );
}

const columnsOf = (rows: Record<string, Cell>[]) =>
  rows.length ? Object.keys(rows[0]!) : [];

/** Human-only verification evidence; this action is not exposed to the agent. */
export function VerificationDiff({
  id,
  check,
}: {
  id: string;
  check: unknown;
}) {
  const t = useT();
  const diff = useActionQuery("get-verification-diff", { id });
  const all = (check as { checks?: Check[] } | null)?.checks ?? [];
  // Each frozen reference runs its own comparator self-check; show the aggregate.
  const checks = all.length
    ? [
        {
          exampleId: "all",
          pass: all.every((c) => c.pass),
          identical: all.every((c) => c.identical),
          changedRejected: all.every((c) => c.changedRejected),
          droppedRejected: all.every((c) => c.droppedRejected),
        },
      ]
    : [];
  const comparatorOk = (check as { pass?: boolean } | null)?.pass === true;
  const diffs = (diff.data?.diffs ?? []) as Diff[];
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("rote.flow.checkFirst")}</p>
        <div className="flex flex-wrap gap-1.5">
          {checks.length ? (
            checks.map((c) => (
              <span key={c.exampleId} className="contents">
                <StatusPill ok={c.identical} label={t("rote.flow.identical")} />
                <StatusPill
                  ok={c.changedRejected}
                  label={t("rote.flow.changedRejected")}
                />
                <StatusPill
                  ok={c.droppedRejected}
                  label={t("rote.flow.droppedRejected")}
                />
              </span>
            ))
          ) : (
            <StatusPill ok={comparatorOk} label={t("rote.flow.checkFirst")} />
          )}
        </div>
      </div>
      {diff.isLoading && (
        <div className="h-20 animate-pulse rounded-lg bg-muted" aria-busy />
      )}
      {diff.error && (
        <p role="alert" className="text-sm text-destructive">
          {t("rote.loadError")}
        </p>
      )}
      {diffs.map((d) => {
        const ok = d.pass === true;
        const missing = d.missing ?? [],
          unexpected = d.unexpected ?? [];
        return (
          <div
            key={d.exampleId}
            className={cn(
              "space-y-3 rounded-lg border p-3",
              ok ? "border-emerald-600/40" : "border-red-600/40",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {d.holdout
                  ? t("rote.flow.holdoutExample")
                  : t("rote.flow.trainingExample")}
              </p>
              <StatusPill
                ok={ok}
                label={ok ? t("rote.flow.rowsMatch") : t("rote.flow.mismatch")}
              />
            </div>
            {d.error && <p className="text-sm text-destructive">{d.error}</p>}
            {d.columnsMatch === false && (
              <p className="text-sm text-destructive">
                {t("rote.flow.columnsDiffer")}
              </p>
            )}
            {!ok && missing.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("rote.flow.missingRows")} (
                  {d.missingCount ?? missing.length})
                </p>
                <RowsTable
                  columns={columnsOf(missing)}
                  rows={missing}
                  tone="missing"
                />
              </div>
            )}
            {!ok && unexpected.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t("rote.flow.unexpectedRows")} (
                  {d.unexpectedCount ?? unexpected.length})
                </p>
                <RowsTable
                  columns={columnsOf(unexpected)}
                  rows={unexpected}
                  tone="unexpected"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
