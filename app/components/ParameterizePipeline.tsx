import { callAction } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useState } from "react";

import { parameterEditsSchema } from "../../shared/rote/pipeline";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
export function ParameterizePipeline({
  id,
  onDone,
}: {
  id: string;
  onDone: () => void;
}) {
  const t = useT(),
    [text, setText] = useState(
      '[{"step":0,"path":["currency"],"name":"currency"}]',
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details>
      <summary className="cursor-pointer text-sm">
        {t("rote.parameterize")}
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          {t("rote.parameterizeHelp")}
        </p>
        <label className="grid gap-1 text-sm">
          {t("rote.parameterMappings")}
          <Textarea
            className="min-h-24 font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            void Promise.resolve()
              .then(() =>
                callAction("parameterize-pipeline", {
                  id,
                  edits: parameterEditsSchema.parse(JSON.parse(text)),
                }),
              )
              .then(() => onDone())
              .catch((e) =>
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not generalize parameters",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          {t("rote.createCandidate")}
        </Button>
      </div>
    </details>
  );
}
