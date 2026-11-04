import { useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useEffect, useState } from "react";

const CACHE_KEY = "rote.demoBanner";

function readCache(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}
function writeCache(text: string | null) {
  try {
    if (text) localStorage.setItem(CACHE_KEY, text);
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage can be unavailable; the banner still renders from live status.
  }
}

/**
 * Shown only on a ROTE_PUBLIC_DEMO deployment. The last banner text is cached
 * per browser so a returning visitor's page does not jump down when the
 * status request resolves after the content has painted.
 */
export function DemoBanner() {
  const t = useT();
  const status = useActionQuery("get-demo-status", {});
  const [cached, setCached] = useState<string | null>(null);
  useEffect(() => setCached(readCache()), []);

  let text: string | null = null;
  if (status.data?.publicDemo) {
    const next = status.data.nextResetAt
      ? new Date(status.data.nextResetAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    text =
      (status.data.agent
        ? t("rote.demo.bannerAgent", {
            limit: status.data.agent.turnsPerHour,
            left: status.data.agent.turnsLeft,
          })
        : t("rote.demo.banner")) +
      (next ? ` ${t("rote.demo.nextReset")} ${next}.` : "");
  }
  useEffect(() => {
    if (status.data) writeCache(text);
  }, [status.data, text]);

  const shown = status.data ? text : cached;
  if (!shown) return null;
  return (
    <div
      role="note"
      className="border-b bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-900 dark:text-amber-200"
    >
      {shown}
    </div>
  );
}
