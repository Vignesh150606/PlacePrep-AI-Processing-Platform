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
  const { data, isLoading, isError, refetch } = useQuestions();
  const { data: wrongAnswerData } = useWrongAnswers();
  const { data: bookmarkData } = useBookmarksList();
  const { data: inProgress, isLoading: inProgressLoading } = useInProgressAttempt();
  const startAttempt = useStartQuizAttempt();
  const submitAttempt = useSubmitQuizAttempt();
  const abandonAttempt = useAbandonQuizAttempt();

  const allQuestions = data?.items ?? [];
  const questionById = new Map(allQuestions.map((q) => [q.id, q]));
  const [stage, setStage] = React.useState<QuizStage>({ step: "config" });
  const [resumeDismissed, setResumeDismissed] = React.useState(false);

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

      {stage.step === "config" &&
        (isLoading ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : isError ? (
          <ErrorState description="We couldn't load the question bank." onRetry={() => refetch()} />
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
          <QuizConfigForm key={initialMode ?? "mixed"} onStart={handleStart} defaultMode={initialMode} />
        ))}

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
