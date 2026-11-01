import type { Plan } from "../../../shared/rote/pipeline";

function refLabel(ref: string) {
  if (ref.startsWith("input:")) return ref.slice(6);
  if (ref.startsWith("step:")) return `step ${Number(ref.slice(5)) + 1}`;
  return ref;
}

function summarize(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1 && entries[0]![0] === "$param")
      return `{${String(entries[0]![1])}}`;
    return entries.map(([k, v]) => `${k}: ${summarize(v)}`).join(", ");
  }
  if (Array.isArray(value)) return `[${value.map(summarize).join(", ")}]`;
  if (typeof value === "string")
    return value.length > 40 ? `"${value.slice(0, 37)}…"` : `"${value}"`;
  return String(value);
}

const pretty = (action: string) => action.split("_").join(" ");

/** Read-only view of an allowlisted pipeline; no generated code exists to show. */
export function PipelineSteps({ plan }: { plan: Plan }) {
  return (
    <ol className="grid gap-2">
      {plan.steps.map((step, i) => {
        const { rightTableId: _right, ...params } = step.params as Record<
          string,
          unknown
        >;
        return (
          <li
            key={i}
            className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 rounded-lg border bg-background px-3 py-2.5"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {pretty(step.action)}
                <span className="ml-2 font-normal text-muted-foreground">
                  ← {refLabel(step.input)}
                  {step.right ? ` + ${refLabel(step.right)}` : ""}
                </span>
              </p>
              <p className="mt-0.5 break-words font-mono text-xs text-muted-foreground">
                {summarize(params)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
