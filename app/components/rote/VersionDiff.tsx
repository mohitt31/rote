import { useT } from "@agent-native/core/client/i18n";

import type { Plan } from "../../../shared/rote/pipeline";

type Step = Plan["steps"][number];

// Compare what a step does, not where it sits: input refs shift when a step
// is inserted, so they are left out of the signature.
const signature = (step: Step) => {
  const { rightTableId: _r, ...params } = step.params as Record<
    string,
    unknown
  >;
  return `${step.action.split("_").join(" ")} ${JSON.stringify(params)}`;
};

type Op = { kind: "same" | "removed" | "added"; text: string };

function diff(a: string[], b: string[]): Op[] {
  const n = a.length,
    m = b.length;
  const lcs = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const ops: Op[] = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!)
      ops.push({ kind: "removed", text: a[i++]! });
    else ops.push({ kind: "added", text: b[j++]! });
  }
  while (i < n) ops.push({ kind: "removed", text: a[i++]! });
  while (j < m) ops.push({ kind: "added", text: b[j++]! });
  return ops;
}

/** Step-level comparison of two immutable pipeline versions. */
export function VersionDiff({
  from,
  to,
  fromVersion,
  toVersion,
}: {
  from: Plan;
  to: Plan;
  fromVersion: number;
  toVersion: number;
}) {
  const t = useT();
  const ops = diff(from.steps.map(signature), to.steps.map(signature));
  const changed = ops.filter((o) => o.kind !== "same").length;
  const params = Object.keys(to.parameters ?? {}).filter(
    (p) => !(p in (from.parameters ?? {})),
  );
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">
        v{fromVersion} → v{toVersion}: {changed} {t("rote.flow.changedSteps")}
        {params.length > 0 &&
          ` · ${t("rote.flow.newParameters")}: ${params.join(", ")}`}
        {from.inputs.join("|") !== to.inputs.join("|") &&
          ` · ${t("rote.flow.inputsChanged")}`}
      </p>
      <div className="overflow-hidden rounded-lg border font-mono text-xs">
        {ops.map((op, i) =>
          op.kind === "same" ? (
            <p key={i} className="truncate px-3 py-1 text-muted-foreground">
              {"  "}
              {op.text}
            </p>
          ) : (
            <p
              key={i}
              className={
                op.kind === "removed"
                  ? "break-words bg-red-500/10 px-3 py-1"
                  : "break-words bg-emerald-500/10 px-3 py-1"
              }
            >
              {op.kind === "removed" ? "− " : "+ "}
              {op.text}
            </p>
          ),
        )}
      </div>
    </div>
  );
}
