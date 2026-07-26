import * as React from "react";
import { toast } from "sonner";
import { useSearch } from "@tanstack/react-router";
import type { Question, QuestionResponse, QuizAttempt } from "@placeprep/shared";
import { useQuestions } from "@/hooks/use-questions";
import { useWrongAnswers } from "@/hooks/use-wrong-answers";
import { useBookmarksList } from "@/hooks/use-bookmarks";
import {
  useAbandonQuizAttempt,
  useInProgressAttempt,
  useStartQuizAttempt,
  useSubmitQuizAttempt,
} from "@/hooks/use-quiz-attempts";
import { useCompleteDailyChallenge, useDailyChallenge } from "@/hooks/use-daily-challenge";
import { QuizConfigForm, type QuizConfig } from "@/components/quiz/quiz-config-form";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { QuizResult } from "@/components/quiz/quiz-result";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardX, History, Sparkles } from "lucide-react";

type QuizStage =
  | { step: "config" }
  | { step: "active"; attempt: QuizAttempt; questions: Question[] }
  | { step: "results"; questions: Question[]; responses: QuestionResponse[]; timeTakenSeconds: number };

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function selectQuestions(
  pool: Question[],
  config: QuizConfig,
  wrongAnswerQuestionIds: Set<string>,
  bookmarkedQuestionIds: Set<string>,
): Question[] {
  let filtered = pool;

  if (config.mode === "topic" && config.topic) {
    filtered = filtered.filter((q) => q.topic === config.topic);
  } else if (config.mode === "company" && config.companyId) {
    filtered = filtered.filter((q) => q.companyId === config.companyId);
  } else if (config.mode === "wrong-answers") {
    filtered = filtered.filter((q) => wrongAnswerQuestionIds.has(q.id));
  } else if (config.mode === "bookmarks") {
    filtered = filtered.filter((q) => bookmarkedQuestionIds.has(q.id));
  } else if (config.mode === "random") {
    filtered = shuffle(filtered);
  }

  return filtered.slice(0, config.questionCount);
}

export function QuizPage() {
  // NEW (Sprint 1A): reads the `mode` search param the quiz route now
  // validates (see router.tsx) so Bookmarks/Wrong Answers CTAs land in the
  // right mode instead of the config form always defaulting to "mixed".
  const { mode: initialMode } = useSearch({ from: "/app-layout/quiz" });
  // "daily-challenge" is a route-only mode -- it never reaches
  // `QuizConfigForm`'s own (narrower) mode enum, see router.tsx.
  const isDailyChallenge = initialMode === "daily-challenge";
  const configDefaultMode = isDailyChallenge ? undefined : initialMode;
  const { data, isLoading, isError, refetch } = useQuestions();
  const { data: wrongAnswerData } = useWrongAnswers();
  const { data: bookmarkData } = useBookmarksList();
  const { data: inProgress, isLoading: inProgressLoading } = useInProgressAttempt();
  const { data: dailyChallenge, isError: isDailyChallengeError, refetch: refetchDailyChallenge } = useDailyChallenge();
  const completeDailyChallenge = useCompleteDailyChallenge();
  const startAttempt = useStartQuizAttempt();
  const submitAttempt = useSubmitQuizAttempt();
  const abandonAttempt = useAbandonQuizAttempt();

  const allQuestions = data?.items ?? [];
  const questionById = new Map(allQuestions.map((q) => [q.id, q]));
  const [stage, setStage] = React.useState<QuizStage>({ step: "config" });
  const [resumeDismissed, setResumeDismissed] = React.useState(false);
  // Phase 18 -- Daily Challenge. Set once the challenge's own quiz attempt
  // is started, so `handleComplete` knows to also call
  // `POST /daily-challenge/{id}/complete` (idempotent server-side if the
  // student replays an already-completed challenge for practice).
  const [dailyChallengeProgressId, setDailyChallengeProgressId] = React.useState<string | null>(null);
  const [dailyChallengeFailed, setDailyChallengeFailed] = React.useState(false);
  // ROOT CAUSE (release-QA pass): starting *any* quiz -- including the
  // challenge itself -- inserts an "in-progress" `quiz_attempts` row, same
  // as every other mode. If a student starts today's challenge and
  // doesn't finish it in one sitting, `useInProgressAttempt()` returns
  // that same attempt on every later visit -- the auto-start effect below
  // used to see it and bail out silently and *permanently*, with nothing
  // on screen connecting the resulting generic "interrupted quiz" banner
  // back to the button the student actually clicked. Trivially
  // reproducible: start the challenge, back out before finishing, click
  // "Start Daily Challenge" again. Fixed below by telling the two cases
  // apart instead of treating every in-progress attempt the same way.
  const [dailyChallengeBlockedByOtherAttempt, setDailyChallengeBlockedByOtherAttempt] = React.useState(false);
  const dailyChallengeStartTriggered = React.useRef(false);

  function sameQuestionSet(a: string[] | undefined, b: string[] | undefined): boolean {
    if (!a || !b || a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((id, i) => id === sortedB[i]);
  }

  // Arriving via `?mode=daily-challenge` (the Dashboard's Daily Challenge
  // card) skips the config form entirely and auto-starts today's set --
  // same reasoning `FUNCTIONAL_RECOMMENDATIONS.md` gave for this feature:
  // run it through the existing QuizRunner using the challenge's own
  // `questionIds`, no separate quiz UI needed.
  React.useEffect(() => {
    if (!isDailyChallenge || stage.step !== "config" || inProgressLoading) return;
    if (dailyChallengeStartTriggered.current) return;

    if (inProgress) {
      if (!dailyChallenge) return; // not enough info yet to tell the two cases apart -- wait, don't guess
      // Same question set as today's challenge -> this *is* the
      // challenge, abandoned mid-way. Resume it directly rather than
      // silently blocking or showing a disconnected generic banner.
      if (sameQuestionSet(inProgress.questionIds, dailyChallenge.questionIds)) {
        setDailyChallengeBlockedByOtherAttempt(false);
        dailyChallengeStartTriggered.current = true;
        const questions = inProgress.questionIds
          .map((id) => questionById.get(id))
          .filter((q): q is Question => Boolean(q));
        if (questions.length === 0) {
          toast.error("Today's challenge questions aren't available anymore.");
          setDailyChallengeFailed(true);
          return;
        }
        setDailyChallengeProgressId(dailyChallenge.id);
        setStage({ step: "active", attempt: inProgress, questions });
        return;
      }
      // A genuinely different interrupted quiz -- don't guess, don't
      // silently do nothing. Surface it explicitly (see the render logic
      // below) instead of falling through to a generic config form. This
      // re-evaluates automatically once that attempt is resumed/discarded
      // (`inProgress` is an effect dependency), no manual retry needed.
      setDailyChallengeBlockedByOtherAttempt(true);
      return;
    }
    setDailyChallengeBlockedByOtherAttempt(false);

    if (!dailyChallenge || allQuestions.length === 0) return;
    dailyChallengeStartTriggered.current = true;

    const questions = dailyChallenge.questionIds
      .map((id) => questionById.get(id))
      .filter((q): q is Question => Boolean(q));
    if (questions.length === 0) {
      toast.error("Today's challenge questions aren't available anymore.");
      setDailyChallengeFailed(true);
      return;
    }
    startAttempt
      .mutateAsync({
        // No dedicated `quiz_attempts.mode` value exists for this --
        // functionally it's a weak-topic-weighted mixed set (see
        // daily_challenge.py's own algorithm docstring), so "mixed" is
        // the accurate existing value rather than a schema change for a
        // label that's cosmetic at the attempt-history level.
        mode: "mixed",
        topic: null,
        companyId: null,
        difficulty: "mixed",
        questionIds: questions.map((q) => q.id),
        timeLimitMinutes: null,
      })
      .then((attempt) => {
        setDailyChallengeProgressId(dailyChallenge.id);
        setStage({ step: "active", attempt, questions });
      })
      .catch(() => {
        toast.error("Couldn't start today's challenge.");
        setDailyChallengeFailed(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDailyChallenge, stage.step, inProgressLoading, inProgress, dailyChallenge, allQuestions.length]);

  const wrongAnswerQuestionIds = new Set(
    (wrongAnswerData?.items ?? []).filter((w) => !w.resolved).map((w) => w.questionId),
  );
  const bookmarkedQuestionIds = new Set(
    (bookmarkData?.items ?? []).filter((b) => b.targetType === "question").map((b) => b.targetId),
  );

  async function handleStart(config: QuizConfig) {
    const questions = selectQuestions(allQuestions, config, wrongAnswerQuestionIds, bookmarkedQuestionIds);
    if (questions.length === 0) {
      toast.error("No questions match that configuration. Try a different mode or topic.");
      return;
    }
    try {
      const attempt = await startAttempt.mutateAsync({
        mode: config.mode,
        topic: config.mode === "topic" ? config.topic ?? null : null,
        companyId: config.mode === "company" ? config.companyId ?? null : null,
        difficulty: "mixed",
        questionIds: questions.map((q) => q.id),
        timeLimitMinutes: config.timeLimitMinutes,
      });
      setStage({ step: "active", attempt, questions });
    } catch {
      toast.error("Couldn't start the quiz. Please try again.");
    }
  }

  async function handleResume(attempt: QuizAttempt) {
    const questions = attempt.questionIds.map((id) => questionById.get(id)).filter((q): q is Question => Boolean(q));
    if (questions.length === 0) {
      toast.error("That quiz's questions are no longer available — starting fresh instead.");
      await abandonAttempt.mutateAsync(attempt.id);
      return;
    }
    setStage({ step: "active", attempt, questions });
  }

  async function handleDiscardInProgress(attempt: QuizAttempt) {
    await abandonAttempt.mutateAsync(attempt.id);
    setResumeDismissed(true);
  }

  async function handleComplete(attempt: QuizAttempt, questions: Question[], responses: QuestionResponse[], timeTakenSeconds: number) {
    try {
      await submitAttempt.mutateAsync({ attemptId: attempt.id, responses, timeTakenSeconds });
    } catch {
      toast.error("Couldn't save this attempt — your score is shown below, but it wasn't recorded.");
    }
    if (dailyChallengeProgressId) {
      completeDailyChallenge.mutate(
        { progressId: dailyChallengeProgressId, quizAttemptId: attempt.id },
        { onError: () => toast.error("Score saved, but couldn't update today's challenge streak.") },
      );
    }
    setStage({ step: "results", questions, responses, timeTakenSeconds });
    const correctCount = responses.filter((r) => r.isCorrect).length;
    toast.success(`Quiz complete — ${correctCount}/${responses.length} correct`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Quiz</h1>
        <p className="text-sm text-muted-foreground">
          Generate a practice quiz from the question bank.
        </p>
      </div>

      {stage.step === "config" && !resumeDismissed && !inProgressLoading && inProgress && (
        <Card className="border-warning-500/40 bg-warning-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <History className="size-5 shrink-0 text-warning-500" />
              <div>
                <p className="text-sm font-medium text-foreground">You have an interrupted quiz</p>
                <p className="text-xs text-muted-foreground">
                  {inProgress.questionIds.length} question{inProgress.questionIds.length === 1 ? "" : "s"}, started{" "}
                  {new Date(inProgress.startedAt).toLocaleString()}
                  {isDailyChallenge && dailyChallengeBlockedByOtherAttempt && (
                    <> — finish or discard it to start today's Daily Challenge.</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => handleDiscardInProgress(inProgress)}>
                Discard
              </Button>
              <Button size="sm" onClick={() => handleResume(inProgress)}>
                Resume
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage.step === "config" && isDailyChallenge && dailyChallengeBlockedByOtherAttempt ? null : (
        stage.step === "config" && (
          isLoading || isDailyChallengeError || isError ? (
            isDailyChallengeError ? (
              <ErrorState
                description="We couldn't load today's Daily Challenge."
                onRetry={() => refetchDailyChallenge()}
              />
            ) : isError ? (
              <ErrorState description="We couldn't load the question bank." onRetry={() => refetch()} />
            ) : (
              <Skeleton className="h-72 w-full rounded-xl" />
            )
          ) : isDailyChallenge && !inProgress && !dailyChallengeFailed ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : allQuestions.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No questions to practice yet"
              description="Upload a placement PDF in the PDF Library — extracted questions will show up here automatically."
            />
          ) : (
            // `key` forces a remount (and fresh react-hook-form defaultValues)
            // when the incoming mode changes between client-side navigations,
            // e.g. Bookmarks -> Quiz then later Wrong Answers -> Quiz without
            // a full page reload in between.
            <QuizConfigForm key={configDefaultMode ?? "mixed"} onStart={handleStart} defaultMode={configDefaultMode} />
          )
        )
      )}

      {stage.step === "active" &&
        (stage.questions.length === 0 ? (
          <EmptyState icon={ClipboardX} title="No questions available" />
        ) : (
          <QuizRunner
            questions={stage.questions}
            timeLimitMinutes={stage.attempt.timeLimitMinutes}
            startedAt={stage.attempt.startedAt}
            onComplete={(responses, timeTakenSeconds) =>
              handleComplete(stage.attempt, stage.questions, responses, timeTakenSeconds)
            }
          />
        ))}

      {stage.step === "results" && (
        <QuizResult
          questions={stage.questions}
          responses={stage.responses}
          timeTakenSeconds={stage.timeTakenSeconds}
          onRetry={() => setStage({ step: "config" })}
        />
      )}
    </div>
  );
}
