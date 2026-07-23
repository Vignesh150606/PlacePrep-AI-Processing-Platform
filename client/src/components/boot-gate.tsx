import * as React from "react";
import { Loader2, ServerCrash, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;
const WARM_FLAG_KEY = "placeprep-backend-warm";
const HEALTH_TIMEOUT_MS = 8_000;
const MAX_BACKOFF_MS = 10_000;
const MAX_ATTEMPTS = 12; // ~2 minutes of foreground retrying before showing "failed"
// Once "failed", keep quietly polling in the background so the gate can
// still self-heal -- e.g. a misconfigured CORS_ORIGINS getting fixed on
// the backend, or a flaky network reconnecting -- without the person
// having to notice and click "Try again" themselves.
const BACKGROUND_RETRY_MS = 20_000;
// `fetch()` rejects a CORS-blocked request and a DNS/connection failure
// with the exact same opaque `TypeError: Failed to fetch` -- browsers
// deliberately don't expose *why* a cross-origin request failed, so
// script on the page can't fingerprint another origin's CORS config.
// That means we can't detect "this was a CORS rejection" directly. What
// we *can* observe is timing: a CORS rejection or DNS failure happens
// near-instantly, while a cold-starting Render instance that's genuinely
// just slow to answer hangs until it either responds or hits
// HEALTH_TIMEOUT_MS. A "fails fast, every attempt, never even times out"
// pattern is the practical signal that this isn't a slow server -- it's
// a configuration problem -- so after a few consecutive fast failures we
// switch the copy from "waking up the server" to something that points
// at a config issue instead of repeating a cold-start message that
// retrying won't fix.
const FAST_FAILURE_MS = 1_500;
const FAST_FAILURES_BEFORE_CONFIG_HINT = 3;

type BootState = "checking" | "retrying" | "ready" | "failed";
type FailureKind = "timeout" | "fast-network" | "slow-network" | "http";

interface PingResult {
  ok: boolean;
  kind?: FailureKind;
  status?: number;
}

async function pingHealth(signal: AbortSignal): Promise<PingResult> {
  const startedAt = Date.now();
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { signal });
    if (res.ok) return { ok: true };
    return { ok: false, kind: "http", status: res.status };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, kind: "timeout" };
    }
    const elapsed = Date.now() - startedAt;
    const kind = elapsed < FAST_FAILURE_MS ? "fast-network" : "slow-network";
    if (kind === "fast-network") {
      // Doesn't (can't) claim this IS a CORS error -- just surfaces enough
      // detail in the console for whoever's debugging a deploy to
      // recognize it, since the browser's own CORS console message can
      // easily scroll past unnoticed.
      console.warn(
        "[BootGate] Health check failed immediately rather than timing out. " +
          "This usually means a CORS rejection, a DNS failure, or the API " +
          "being unreachable at VITE_API_BASE_URL -- check the browser console " +
          "for a separate 'blocked by CORS policy' message, and verify " +
          "CORS_ORIGINS / CORS_ORIGIN_REGEX on the backend.",
      );
    }
    return { ok: false, kind };
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
 *
 * UPDATED: the ping now distinguishes *why* a check failed (timeout vs.
 * an instant network/CORS-shaped rejection vs. a non-2xx HTTP response)
 * so a misconfiguration doesn't read as an ordinary slow cold start, and
 * a background retry continues even after showing the "failed" screen so
 * the gate clears itself automatically once the backend/config issue is
 * actually resolved, instead of requiring a manual reload.
 */
export function BootGate({ children }: { children: React.ReactNode }) {
  const alreadyWarm = React.useMemo(
    () => sessionStorage.getItem(WARM_FLAG_KEY) === "1",
    [],
  );
  const [state, setState] = React.useState<BootState>(alreadyWarm ? "ready" : "checking");
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [attempt, setAttempt] = React.useState(0);
  const [lastFailure, setLastFailure] = React.useState<PingResult | null>(null);
  const [consecutiveFastFailures, setConsecutiveFastFailures] = React.useState(0);

  React.useEffect(() => {
    if (alreadyWarm) return;

    let cancelled = false;
    let attemptCount = 0;
    let fastFailureStreak = 0;
    const startedAt = Date.now();

    const tickInterval = setInterval(() => {
      if (!cancelled) setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    function markReady() {
      sessionStorage.setItem(WARM_FLAG_KEY, "1");
      clearInterval(tickInterval);
      setState("ready");
    }

    async function attemptPing({ isBackground }: { isBackground: boolean }) {
      if (cancelled) return;
      if (!isBackground) {
        attemptCount += 1;
        setAttempt(attemptCount);
        setState(attemptCount === 1 ? "checking" : "retrying");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      const result = await pingHealth(controller.signal);
      clearTimeout(timeout);
      if (cancelled) return;

      if (result.ok) {
        markReady();
        return;
      }

      setLastFailure(result);
      fastFailureStreak = result.kind === "fast-network" ? fastFailureStreak + 1 : 0;
      setConsecutiveFastFailures(fastFailureStreak);

      if (isBackground) {
        // Already showing "failed" -- keep polling quietly, same cadence,
        // forever, so the gate can clear itself without a manual reload.
        setTimeout(() => attemptPing({ isBackground: true }), BACKGROUND_RETRY_MS);
        return;
      }

      if (attemptCount >= MAX_ATTEMPTS) {
        clearInterval(tickInterval);
        setState("failed");
        setTimeout(() => attemptPing({ isBackground: true }), BACKGROUND_RETRY_MS);
        return;
      }

      const backoff = Math.min(1000 * 2 ** (attemptCount - 1), MAX_BACKOFF_MS);
      setTimeout(() => attemptPing({ isBackground: false }), backoff);
    }

    attemptPing({ isBackground: false });

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

  const looksLikeConfigIssue =
    consecutiveFastFailures >= FAST_FAILURES_BEFORE_CONFIG_HINT ||
    lastFailure?.kind === "fast-network";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <Logo className="size-12" />
      {state === "failed" ? (
        looksLikeConfigIssue ? (
          <>
            <ShieldAlert className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              Can't reach the server -- this looks like a configuration issue.
            </p>
            <p className="max-w-xs text-sm text-muted-foreground">
              The connection was rejected right away rather than timing out, which usually means
              a browser security (CORS) setting or network issue is blocking the app, not that the
              server is slow. We'll keep checking automatically, and this screen will disappear on
              its own once it's reachable.
            </p>
            <Button onClick={retryNow} className="mt-1">
              Try again
            </Button>
          </>
        ) : (
          <>
            <ServerCrash className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Still can't reach the server.</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              The free-tier server can occasionally take longer than usual to wake up, or your
              connection may have dropped. We'll keep checking automatically, or you can try now.
            </p>
            <Button onClick={retryNow} className="mt-1">
              Try again
            </Button>
          </>
        )
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
