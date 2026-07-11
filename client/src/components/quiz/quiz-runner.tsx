import * as React from "react";
import {
  Flag,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Timer as TimerIcon,
  Keyboard,
  LayoutGrid,
  X,
} from "lucide-react";
import type { Question, QuestionResponse } from "@placeprep/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";

interface PerQuestionState {
  selectedOptionId: string | null;
  markedForReview: boolean;
  visited: boolean;
  timeSpentSeconds: number;
}

interface QuizRunnerProps {
  questions: Question[];
  timeLimitMinutes: number | null;
  /** ISO timestamp the attempt actually started at (for "resume interrupted quiz" —
   * the timer/elapsed-time math accounts for time that already passed server-side). */
  startedAt?: string;
  onComplete: (responses: QuestionResponse[], timeTakenSeconds: number) => void;
}

function paletteClasses(state: PerQuestionState | undefined, isCurrent: boolean) {
  if (isCurrent) return "border-accent-600 ring-2 ring-accent-600/40 text-foreground";
  if (!state || !state.visited) return "border-border text-muted-foreground hover:bg-surface";
  if (state.markedForReview && state.selectedOptionId) return "border-accent-400 bg-accent-400/15 text-accent-700 dark:text-accent-400";
  if (state.markedForReview) return "border-warning-500 bg-warning-500/10 text-warning-500";
  if (state.selectedOptionId) return "border-correct-500/50 bg-correct-500/10 text-correct-700 dark:text-correct-500";
  return "border-incorrect-500/40 bg-incorrect-500/5 text-incorrect-600 dark:text-incorrect-500";
}

interface QuestionPaletteContentProps {
  questions: Question[];
  states: Record<string, PerQuestionState>;
  currentIndex: number;
  answeredCount: number;
  markedCount: number;
  onGoTo: (index: number) => void;
  onSubmit: () => void;
}

/**
 * NEW (Sprint 1A): the palette grid + stats + submit button, extracted out
 * of the always-visible desktop Card so the exact same markup can be reused
 * inside the mobile bottom sheet below — one source of truth instead of two
 * copies that could drift.
 */
function QuestionPaletteContent({
  questions,
  states,
  currentIndex,
  answeredCount,
  markedCount,
  onGoTo,
  onSubmit,
}: QuestionPaletteContentProps) {
  return (
    <>
      <div className="grid grid-cols-5 gap-1.5">
        {questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            onClick={() => onGoTo(i)}
            aria-label={`Go to question ${i + 1}`}
            className={cn(
              "flex size-8 items-center justify-center rounded-md border text-xs font-medium transition-colors",
              paletteClasses(states[q.id], i === currentIndex),
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1 border-t border-border-subtle pt-3 text-xs text-muted-foreground">
        <p>{answeredCount} answered</p>
        <p>{questions.length - answeredCount} unanswered</p>
        <p>{markedCount} marked for review</p>
      </div>
      <Button size="sm" variant="destructive" onClick={onSubmit} className="mt-1">
        Submit quiz
      </Button>
    </>
  );
}

export function QuizRunner({ questions, timeLimitMinutes, startedAt, onComplete }: QuizRunnerProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [states, setStates] = React.useState<Record<string, PerQuestionState>>(() =>
    Object.fromEntries(
      questions.map((q, i) => [
        q.id,
        { selectedOptionId: null, markedForReview: false, visited: i === 0, timeSpentSeconds: 0 },
      ]),
    ),
  );
  const startedAtRef = React.useRef(startedAt ? new Date(startedAt).getTime() : Date.now());
  const questionEnteredAtRef = React.useRef(Date.now());
  const elapsedAlreadySeconds = startedAt
    ? Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000))
    : 0;
  const [remainingSeconds, setRemainingSeconds] = React.useState(
    timeLimitMinutes ? Math.max(0, timeLimitMinutes * 60 - elapsedAlreadySeconds) : null,
  );
  const submittedRef = React.useRef(false);
  // NEW (Sprint 1A): mobile/tablet palette bottom sheet — see the render
  // below for why this replaces the palette Card simply falling below the
  // question card once the layout drops under the lg breakpoint.
  const [paletteSheetOpen, setPaletteSheetOpen] = React.useState(false);
  const { containerRef: paletteSheetRef } = useDialogA11y({
    open: paletteSheetOpen,
    onClose: () => setPaletteSheetOpen(false),
  });

  const question = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const answeredCount = Object.values(states).filter((s) => s.selectedOptionId).length;
  const markedCount = Object.values(states).filter((s) => s.markedForReview).length;

  const buildResponses = React.useCallback((): QuestionResponse[] => {
    return questions.map((q) => {
      const state = states[q.id];
      const selectedOption = q.options.find((o) => o.id === state?.selectedOptionId);
      return {
        questionId: q.id,
        selectedOptionIds: state?.selectedOptionId ? [state.selectedOptionId] : [],
        isCorrect: Boolean(selectedOption?.isCorrect),
        timeSpentSeconds: state?.timeSpentSeconds ?? 0,
        wasSkipped: !state?.selectedOptionId,
        markedForReview: Boolean(state?.markedForReview),
      };
    });
  }, [questions, states]);

  const submit = React.useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const timeTakenSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
    onComplete(buildResponses(), timeTakenSeconds);
  }, [buildResponses, onComplete]);

  // Countdown + auto-submit when the timer runs out.
  React.useEffect(() => {
    if (remainingSeconds === null) return;
    if (remainingSeconds <= 0) {
      submit();
      return;
    }
    const id = window.setInterval(() => {
      setRemainingSeconds((s) => (s === null ? null : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [remainingSeconds, submit]);

  function commitTimeOnCurrent() {
    const spent = Math.round((Date.now() - questionEnteredAtRef.current) / 1000);
    if (!question) return;
    setStates((prev) => ({
      ...prev,
      [question.id]: {
        ...prev[question.id],
        timeSpentSeconds: (prev[question.id]?.timeSpentSeconds ?? 0) + spent,
      },
    }));
    questionEnteredAtRef.current = Date.now();
  }

  function goTo(index: number) {
    if (index < 0 || index >= questions.length) return;
    commitTimeOnCurrent();
    setCurrentIndex(index);
    const targetId = questions[index]?.id;
    if (targetId) {
      setStates((prev) => ({ ...prev, [targetId]: { ...prev[targetId], visited: true } }));
    }
  }

  function selectOption(optionId: string) {
    if (!question) return;
    setStates((prev) => ({
      ...prev,
      [question.id]: { ...prev[question.id], selectedOptionId: optionId, visited: true },
    }));
  }

  function clearResponse() {
    if (!question) return;
    setStates((prev) => ({ ...prev, [question.id]: { ...prev[question.id], selectedOptionId: null } }));
  }

  function toggleMarkForReview() {
    if (!question) return;
    setStates((prev) => ({
      ...prev,
      [question.id]: { ...prev[question.id], markedForReview: !prev[question.id]?.markedForReview },
    }));
  }

  function skip() {
    if (isLast) {
      submit();
      return;
    }
    goTo(currentIndex + 1);
  }

  // ADDED (explicit brief requirement — "Keyboard shortcuts" under Quiz
  // Experience — previously absent entirely). 1-9 / A-D select an option,
  // Left/Right move between questions, M toggles Mark for Review, Enter
  // submits on the last question. Ignored while a text input/textarea is
  // focused (none currently exist on this page, but this keeps the
  // handler safe if one is ever added) and while a modifier key is held,
  // so it never shadows browser/OS shortcuts. Also ignored while the
  // mobile palette sheet is open (Sprint 1A) so its own Tab/Escape focus
  // trap isn't fought by these global shortcuts underneath it.
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || !question || paletteSheetOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (e.key >= "1" && e.key <= "9") {
        const option = question.options[Number(e.key) - 1];
        if (option) {
          e.preventDefault();
          selectOption(option.id);
        }
        return;
      }
      if (/^[a-dA-D]$/.test(e.key)) {
        const option = question.options[e.key.toUpperCase().charCodeAt(0) - 65];
        if (option) {
          e.preventDefault();
          selectOption(option.id);
        }
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (isLast) submit();
        else goTo(currentIndex + 1);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(currentIndex - 1);
        return;
      }
      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        toggleMarkForReview();
        return;
      }
      if (e.key === "Enter" && isLast) {
        e.preventDefault();
        submit();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  if (!question) return null;

  const currentState = states[question.id];
  const isLowTime = remainingSeconds !== null && remainingSeconds <= 60;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
      <Card>
        <CardContent className="flex flex-col gap-5 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Question {currentIndex + 1} of {questions.length}
            </p>
            {remainingSeconds !== null && (
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums",
                  isLowTime
                    ? "border-incorrect-500/40 bg-incorrect-500/10 text-incorrect-600 dark:text-incorrect-500"
                    : "border-border-subtle text-muted-foreground",
                )}
              >
                <TimerIcon className="size-3.5" />
                {formatDuration(remainingSeconds)}
              </span>
            )}
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-accent-600 transition-all"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>

          <p className="text-base font-medium leading-relaxed text-foreground">{question.text}</p>

          <div role="radiogroup" aria-label="Answer options" className="flex flex-col gap-2">
            {question.options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={currentState?.selectedOptionId === option.id}
                onClick={() => selectOption(option.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  currentState?.selectedOptionId === option.id
                    ? "border-accent-600 bg-accent-600/10 text-foreground"
                    : "border-border text-foreground hover:bg-surface",
                )}
              >
                <span className="font-medium text-muted-foreground">{option.label}.</span>
                {option.text}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-4">
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}>
                <ChevronLeft className="size-3.5" />
                Previous
              </Button>
              <Button variant="ghost" size="sm" onClick={clearResponse} disabled={!currentState?.selectedOptionId}>
                <RotateCcw className="size-3.5" />
                Clear
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant={currentState?.markedForReview ? "primary" : "secondary"}
                size="sm"
                onClick={toggleMarkForReview}
              >
                <Flag className="size-3.5" />
                {currentState?.markedForReview ? "Marked" : "Mark for Review"}
              </Button>
              {isLast ? (
                <Button size="sm" onClick={submit}>
                  Submit quiz
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={skip}>
                  Skip
                </Button>
              )}
              {!isLast && (
                <Button size="sm" onClick={() => goTo(currentIndex + 1)}>
                  Next
                  <ChevronRight className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FIX (Sprint 1A): previously rendered unconditionally, so once the
          grid collapsed to one column below lg it fell below the question
          card — reachable only by scrolling past it. Now desktop-only; the
          mobile/tablet equivalent is the floating trigger + bottom sheet
          below. */}
      <Card className="hidden h-fit lg:block">
        <CardContent className="flex flex-col gap-3 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Question palette</p>
          <div
            className="flex items-start gap-1.5 rounded-lg bg-surface px-2.5 py-2 text-[11px] leading-snug text-muted-foreground"
            title="Keyboard shortcuts: number or letter keys select an option, Left/Right arrows move between questions, M marks for review, Enter submits on the last question."
          >
            <Keyboard className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              <kbd className="rounded border border-border-subtle px-1 font-sans">1–4</kbd> select ·{" "}
              <kbd className="rounded border border-border-subtle px-1 font-sans">←→</kbd> navigate ·{" "}
              <kbd className="rounded border border-border-subtle px-1 font-sans">M</kbd> mark
            </span>
          </div>
          <QuestionPaletteContent
            questions={questions}
            states={states}
            currentIndex={currentIndex}
            answeredCount={answeredCount}
            markedCount={markedCount}
            onGoTo={goTo}
            onSubmit={submit}
          />
        </CardContent>
      </Card>

      {/* NEW (Sprint 1A): mobile/tablet palette access — a floating trigger
          that opens a bottom sheet, so the palette is reachable without
          scrolling past the question. */}
      <button
        type="button"
        onClick={() => setPaletteSheetOpen(true)}
        aria-label={`Open question palette. ${answeredCount} of ${questions.length} answered.`}
        className="fixed bottom-5 right-4 z-40 flex items-center gap-2 rounded-full border border-border bg-surface-raised px-4 py-2.5 text-xs font-semibold text-foreground shadow-lg transition-colors hover:bg-surface lg:hidden"
      >
        <LayoutGrid className="size-4" />
        {currentIndex + 1}/{questions.length}
      </button>

      {paletteSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setPaletteSheetOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={paletteSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Question palette"
            tabIndex={-1}
            className="relative flex max-h-[70vh] flex-col gap-3 rounded-t-2xl border-t border-border bg-surface-raised p-4 shadow-xl animate-slide-in-bottom focus-visible:outline-none"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Question palette</p>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close question palette"
                onClick={() => setPaletteSheetOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto">
              <QuestionPaletteContent
                questions={questions}
                states={states}
                currentIndex={currentIndex}
                answeredCount={answeredCount}
                markedCount={markedCount}
                onGoTo={(index) => {
                  goTo(index);
                  setPaletteSheetOpen(false);
                }}
                onSubmit={submit}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
