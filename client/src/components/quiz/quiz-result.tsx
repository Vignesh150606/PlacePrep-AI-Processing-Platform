import { RotateCcw, CheckCircle2, XCircle, MinusCircle, Clock, Target } from "lucide-react";
import type { Question, QuestionResponse } from "@placeprep/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExplanationSection } from "@/components/questions/explanation-section";
import { formatDuration, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface QuizResultProps {
  questions: Question[];
  responses: QuestionResponse[];
  timeTakenSeconds: number;
  onRetry: () => void;
}

export function QuizResult({ questions, responses, timeTakenSeconds, onRetry }: QuizResultProps) {
  const correctCount = responses.filter((r) => r.isCorrect).length;
  const skippedCount = responses.filter((r) => r.wasSkipped).length;
  const wrongCount = responses.length - correctCount - skippedCount;
  const accuracy = responses.length > 0 ? (correctCount / responses.length) * 100 : 0;
  const score = accuracy;

  return (
    <div className="flex flex-col gap-5">
      <Card className="animate-fade-up">
        <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">Your score</p>
          <p className="text-4xl font-semibold tabular-nums text-foreground">{formatPercent(score)}</p>
          <p className="text-sm text-muted-foreground">
            {correctCount} of {responses.length} correct
          </p>

          <div className="mt-4 grid w-full max-w-md grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col items-center gap-1 rounded-lg bg-surface p-3">
              <Target className="size-4 text-accent-600" />
              <p className="text-sm font-semibold tabular-nums text-foreground">{formatPercent(accuracy)}</p>
              <p className="text-[11px] text-muted-foreground">Accuracy</p>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-lg bg-surface p-3">
              <Clock className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold tabular-nums text-foreground">{formatDuration(timeTakenSeconds)}</p>
              <p className="text-[11px] text-muted-foreground">Time taken</p>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-lg bg-surface p-3">
              <XCircle className="size-4 text-incorrect-500" />
              <p className="text-sm font-semibold tabular-nums text-foreground">{wrongCount}</p>
              <p className="text-[11px] text-muted-foreground">Wrong</p>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-lg bg-surface p-3">
              <MinusCircle className="size-4 text-warning-500" />
              <p className="text-sm font-semibold tabular-nums text-foreground">{skippedCount}</p>
              <p className="text-[11px] text-muted-foreground">Skipped</p>
            </div>
          </div>

          <Button onClick={onRetry} variant="secondary" size="sm" className="mt-3">
            <RotateCcw className="size-3.5" />
            Try another quiz
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {responses.map((result) => {
          const question = questions.find((q) => q.id === result.questionId);
          if (!question) return null;
          const selectedOption = question.options.find((o) => o.id === result.selectedOptionIds[0]);
          const correctOption = question.options.find((o) => o.isCorrect);

          return (
            <Card key={result.questionId} className="p-4">
              <div className="flex items-start gap-3">
                {result.wasSkipped ? (
                  <MinusCircle className="mt-0.5 size-5 shrink-0 text-warning-500" />
                ) : result.isCorrect ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-correct-600 dark:text-correct-500" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-incorrect-600 dark:text-incorrect-500" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{question.text}</p>
                  <p
                    className={cn(
                      "mt-1 text-sm",
                      result.wasSkipped
                        ? "text-warning-500"
                        : result.isCorrect
                          ? "text-correct-600 dark:text-correct-500"
                          : "text-incorrect-600 dark:text-incorrect-500",
                    )}
                  >
                    Your answer: {result.wasSkipped ? "Skipped" : (selectedOption?.text ?? "—")}
                  </p>
                  {!result.isCorrect && (
                    <p className="text-sm text-correct-600 dark:text-correct-500">
                      Correct answer: {correctOption?.text}
                    </p>
                  )}
                  <ExplanationSection
                    correctExplanation={question.correctExplanation}
                    solutionSteps={question.solutionSteps}
                    className="mt-2"
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
