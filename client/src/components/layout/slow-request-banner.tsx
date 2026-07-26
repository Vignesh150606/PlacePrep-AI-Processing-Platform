import * as React from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

const SHOW_AFTER_MS = 3_000;

/**
 * Free-tier keep-alive pass. `boot-gate.tsx` already gives a rich
 * "waking up the server" experience for the *first* load of a tab
 * session -- then deliberately flags itself "warm" (sessionStorage) and
 * gets out of the way for every navigation after that, on purpose, so it
 * doesn't reappear on ordinary client-side route changes.
 *
 * The gap that leaves: if someone leaves a tab open past Render's free-tier
 * ~15-minute idle window, the instance falls back asleep -- BootGate has
 * already done its job and won't check again, so the next request they
 * make (clicking into a new page, submitting a quiz) just hangs with
 * whatever plain skeleton/spinner that one query already shows. That
 * reads as "broken", not "slow", which is exactly the failure mode
 * BootGate exists to avoid for the first load but can't, by its own
 * design, avoid for this later case.
 *
 * This is deliberately generic rather than per-query: `useIsFetching()`/
 * `useIsMutating()` are global counts across every React Query call in
 * the app, so this catches a slow cold-start regardless of which button
 * or page triggered it, without every individual hook needing its own
 * copy of this logic. `SHOW_AFTER_MS` avoids flashing this on every
 * ordinary request -- most real requests settle in well under 3s, so
 * this only appears when something is genuinely, unusually slow.
 */
export function SlowRequestBanner() {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const isBusy = isFetching > 0 || isMutating > 0;
  const [showBanner, setShowBanner] = React.useState(false);

  React.useEffect(() => {
    if (!isBusy) {
      setShowBanner(false);
      return;
    }
    const timer = setTimeout(() => setShowBanner(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [isBusy]);

  if (!showBanner) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-accent-600/10 px-4 py-1.5 text-xs font-medium text-accent-700 dark:text-accent-400"
      style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
      This is taking longer than usual — the free-tier server may be waking up.
    </div>
  );
}
