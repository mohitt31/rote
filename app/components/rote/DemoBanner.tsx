import { useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";

/** Shown only on a ROTE_PUBLIC_DEMO deployment. */
export function DemoBanner() {
  const t = useT();
  const status = useActionQuery("get-demo-status", {});
  if (!status.data?.publicDemo) return null;
  const next = status.data.nextResetAt
    ? new Date(status.data.nextResetAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  return (
    <div
      role="note"
      className="border-b bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-900 dark:text-amber-200"
    >
      {status.data.agent
        ? t("rote.demo.bannerAgent", {
            limit: status.data.agent.turnsPerHour,
            left: status.data.agent.turnsLeft,
          })
        : t("rote.demo.banner")}
      {next ? ` ${t("rote.demo.nextReset")} ${next}.` : ""}
    </div>
  );
}
