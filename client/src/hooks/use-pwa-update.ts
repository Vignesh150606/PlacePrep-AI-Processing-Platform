import * as React from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

// NEW (Phase 14, Part 1 -- Mobile Experience & PWA). Bridges the service
// worker's two lifecycle events a person actually needs to know about into
// the app's existing toast system (sonner, already wired in `AppLayout`)
// instead of a bare browser `confirm()`:
//  - `needRefresh`: a new version finished downloading and is waiting --
//    show a persistent "Update available" toast with a Reload action.
//  - `offlineReady`: the very first successful precache completed, i.e.
//    "this app now works offline" -- a one-time confirmation toast.
// Call this once, near the app root, so it isn't mounted/unmounted per
// route.
export function usePwaUpdate() {
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegisterError: (error) => {
      // Registration failures shouldn't crash the app or spam the user --
      // log for diagnosis, same severity as any other soft background
      // failure elsewhere in this codebase.
      console.error("Service worker registration failed:", error);
    },
  });
  const [needRefreshValue] = needRefresh;
  const [offlineReadyValue, setOfflineReady] = offlineReady;
  const shownUpdateToast = React.useRef(false);
  const shownOfflineToast = React.useRef(false);

  React.useEffect(() => {
    if (needRefreshValue && !shownUpdateToast.current) {
      shownUpdateToast.current = true;
      toast("Update available", {
        id: "pwa-update-available",
        description: "A new version of PlacePrep is ready.",
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => updateServiceWorker(true),
        },
      });
    }
  }, [needRefreshValue, updateServiceWorker]);

  React.useEffect(() => {
    if (offlineReadyValue && !shownOfflineToast.current) {
      shownOfflineToast.current = true;
      toast.success("Ready to work offline", {
        id: "pwa-offline-ready",
        description: "PlacePrep has cached what it needs to keep working without a connection.",
        duration: 5000,
      });
      setOfflineReady(false);
    }
  }, [offlineReadyValue, setOfflineReady]);
}
