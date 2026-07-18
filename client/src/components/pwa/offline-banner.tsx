import * as React from "react";
import { WifiOff } from "lucide-react";

// NEW (Phase 14, Part 1 -- Mobile Experience & PWA). Distinct from the
// install prompt and the update toast: this is a live `navigator.onLine`
// reflection, not a one-time notification, so it's a persistent inline
// banner (not a toast) that appears and clears itself automatically as
// connectivity changes. Pairs with the service worker's own caching (a
// student can keep reading whatever they'd already opened) by making the
// degraded state visible rather than silent.
export function OfflineBanner() {
  const [isOffline, setIsOffline] = React.useState(() => !navigator.onLine);

  React.useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning-500/15 px-4 py-1.5 text-xs font-medium text-warning-500"
      style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
    >
      <WifiOff className="size-3.5 shrink-0" />
      You're offline — showing what's already been loaded
    </div>
  );
}
