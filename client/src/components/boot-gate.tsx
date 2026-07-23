import * as React from "react";
import { Loader2, ServerCrash } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;
const WARM_FLAG_KEY = "placeprep-backend-warm";
const HEALTH_TIMEOUT_MS = 8_000;
const MAX_BACKOFF_MS = 10_000;
const MAX_ATTEMPTS = 12; // ~2 minutes of retrying before asking the person to retry by hand

type BootState = "checking" | "retrying" | "ready" | "failed";

async function pingHealth(signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { signal });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * NEW (Phase 16): the deployed backend runs on Render's free tier, which
 * spins the instance down after ~15 minutes idle and takes 30-60+ seconds to
 * cold-start the next request. Without this gate, the first thing anyone
 * hitting a cold app sees is every API call on the dashboard failing at
 * once (profile, question bank, notifications...) which reads as a broken
 * app, not a slow one. This waits for a real 200 from `/health` -- with
 * capped exponential backoff -- before mounting anything that depends on
 * the API, so there's one honest "waking up the server" message instead.
 *
 * Skipped after the first successful check in a tab session
 * (`sessionStorage`), so it only ever appears on a genuine cold load, not
 * on every client-side route change.
 */
export function BootGate({ children }: { children: React.ReactNode }) {
  const alreadyWarm = React.useMemo(
    () => sessionStorage.getItem(WARM_FLAG_KEY) === "1",
    [],
  );
  const [state, setState] = React.useState<BootState>(alreadyWarm ? "ready" : "checking");
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (alreadyWarm) return;

    let cancelled = false;
    let attemptCount = 0;
    const startedAt = Date.now();

    const tickInterval = setInterval(() => {
      if (!cancelled) setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    async function attemptPing() {
      if (cancelled) return;
      attemptCount += 1;
      setAttempt(attemptCount);
      setState(attemptCount === 1 ? "checking" : "retrying");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      const ok = await pingHealth(controller.signal);
      clearTimeout(timeout);
      if (cancelled) return;

      if (ok) {
        sessionStorage.setItem(WARM_FLAG_KEY, "1");
        clearInterval(tickInterval);
        setState("ready");
        return;
      }

      if (attemptCount >= MAX_ATTEMPTS) {
        clearInterval(tickInterval);
        setState("failed");
        return;
      }

      const backoff = Math.min(1000 * 2 ** (attemptCount - 1), MAX_BACKOFF_MS);
      setTimeout(attemptPing, backoff);
    }

    attemptPing();

    return () => {
      cancelled = true;
      clearInterval(tickInterval);
    };
  }, [alreadyWarm]);

  function retryNow() {
    sessionStorage.removeItem(WARM_FLAG_KEY);
    window.location.reload();
  }

  if (state === "ready") return <>{children}</>;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <Logo className="size-12" />
      {state === "failed" ? (
        <>
          <ServerCrash className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Still can't reach the server.</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            The free-tier server can occasionally take longer than usual to wake up, or your
            connection may have dropped. Give it another try.
          </p>
          <Button onClick={retryNow} className="mt-1">
            Try again
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">
            {attempt <= 1 ? "Connecting…" : "Waking up the server…"}
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {attempt <= 1
              ? "Just a moment."
              : `The free-tier server naps when idle and takes a little while to wake up -- ${elapsedSeconds}s so far.`}
          </p>
        </>
      )}
    </div>
  );
}
