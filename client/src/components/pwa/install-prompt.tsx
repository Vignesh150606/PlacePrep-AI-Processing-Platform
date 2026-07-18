import * as React from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "placeprep-install-dismissed-at";
// Re-offer after this long, rather than never again -- a person who
// dismissed it during a rushed first session shouldn't lose the option
// permanently (mirrors the theme toggle's own use of localStorage for a
// plain UI preference, not app data).
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isDismissedRecently(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own (non-standard, hence the cast) flag for "already
    // launched from the home screen."
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * NEW (Phase 14, Part 1 -- Mobile Experience & PWA). A dismissible bottom
 * banner offering installation. Two variants, since `beforeinstallprompt`
 * is a Chromium-only event with no equivalent on iOS Safari:
 *  - Chromium/Android/desktop Chrome: captures the real `beforeinstallprompt`
 *    event and re-fires it from a "Install" button tap.
 *  - iOS Safari: that event never fires at all, and there is no
 *    programmatic install API -- the best available UX is a one-line
 *    instruction pointing at the native Share sheet.
 * Renders nothing once the app is already running standalone.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [dismissed, setDismissed] = React.useState(false);
  const [showIosHint, setShowIosHint] = React.useState(false);

  React.useEffect(() => {
    if (isStandalone() || isDismissedRecently()) return;

    if (isIos()) {
      setShowIosHint(true);
      return;
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "dismissed") dismiss();
  };

  if (dismissed || (!deferredPrompt && !showIosHint)) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-[calc(100%-1.5rem)] max-w-sm items-center gap-3 rounded-xl border border-border bg-surface-raised p-3 shadow-xl animate-fade-up lg:bottom-4 lg:left-4 lg:right-auto lg:mx-0"
      role="region"
      aria-label="Install PlacePrep"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-600/10 text-accent-600">
        {showIosHint ? <Share className="size-4" /> : <Download className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Install PlacePrep</p>
        <p className="text-xs text-muted-foreground">
          {showIosHint
            ? "Tap Share, then \"Add to Home Screen\" for the full-screen app."
            : "Add it to your home screen for quick, full-screen access."}
        </p>
      </div>
      {!showIosHint && (
        <Button size="sm" onClick={install}>
          Install
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Dismiss install prompt"
        className="shrink-0"
        onClick={dismiss}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
