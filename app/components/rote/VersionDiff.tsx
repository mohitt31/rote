import { useT } from "@agent-native/core/client/i18n";

import { cn } from "@/lib/utils";

import type { Plan } from "../../../shared/rote/pipeline";

const key = (step: Plan["steps"][number] | undefined) =>
  step ? JSON.stringify(step) : "";
const line = (step: Plan["steps"][number]) => {
  const { rightTableId: _r, ...params } = step.params as Record<
    string,
    unknown
  >;
  return `${step.action.split("_").join(" ")} ${JSON.stringify(params)}`;
};

/** Step-by-step comparison of two immutable pipeline versions. */
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
  const n = Math.max(from.steps.length, to.steps.length);
  const rows = Array.from({ length: n }, (_, i) => ({
    i,
    a: from.steps[i],
    b: to.steps[i],
  }));
  const changed = rows.filter((r) => key(r.a) !== key(r.b));
  const params = Object.keys(to.parameters ?? {}).filter(
    (p) => !(p in (from.parameters ?? {})),
  );
  const inputsChanged = from.inputs.join("|") !== to.inputs.join("|");
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">
        v{fromVersion} → v{toVersion}: {changed.length}{" "}
        {t("rote.flow.changedSteps")}
        {params.length > 0 &&
          ` · ${t("rote.flow.newParameters")}: ${params.join(", ")}`}
        {inputsChanged && ` · ${t("rote.flow.inputsChanged")}`}
      </p>
      {changed.map(({ i, a, b }) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border font-mono text-xs"
        >
          <p className="bg-muted/60 px-3 py-1 font-sans text-muted-foreground">
            {t("rote.flow.step")} {i + 1}
          </p>
          {a && (
            <p className={cn("break-words bg-red-500/10 px-3 py-1")}>
              − {line(a)}
            </p>
          )}
          {b && (
            <p className="break-words bg-emerald-500/10 px-3 py-1">
              + {line(b)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
