import { callAction } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useState } from "react";

import { Button } from "./ui/button";
export function VerificationDiff({ id }: { id: string }) {
  const t = useT(),
    [diffs, setDiffs] = useState<unknown[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          void callAction("get-verification-diff", { id })
            .then((r) => setDiffs(r.diffs))
            .catch((e) =>
              setError(
                e instanceof Error ? e.message : "Failed to load differences",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        {t("rote.showDiff")}
      </Button>
      {error && <p role="alert">{error}</p>}
      {diffs?.map((diff, i) => {
        const d = diff as { pass?: boolean; holdout?: boolean };
        return (
          <div
            key={i}
            className={`rounded border p-3 ${d.pass ? "border-green-600" : "border-red-600"}`}
          >
            <p className="text-sm font-medium">
              {d.holdout ? "Holdout" : "Training"} · {d.pass ? "PASS" : "FAIL"}
            </p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
              {JSON.stringify(diff, null, 2)}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
