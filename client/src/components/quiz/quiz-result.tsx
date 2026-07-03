import { RotateCcw, CheckCircle2, XCircle } from "lucide-react";
import type { Question } from "@placeprep/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { QuizRunnerResult } from "./quiz-runner";

interface QuizResultProps {
  questions: Question[];
  results: QuizRunnerResult[];
  onRetry: () => void;
}

export function QuizResult({ questions, results, onRetry }: QuizResultProps) {
  const correctCount = results.filter((r) => r.isCorrect).length;
  const score = (correctCount / results.length) * 100;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">Your score</p>
          <p className="text-4xl font-semibold tabular-nums text-foreground">{formatPercent(score)}</p>
          <p className="text-sm text-muted-foreground">
            {correctCount} of {results.length} correct
          </p>
          <Button onClick={onRetry} variant="secondary" size="sm" className="mt-3">
            <RotateCcw className="size-3.5" />
            Try another quiz
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {results.map((result) => {
          const question = questions.find((q) => q.id === result.questionId);
          if (!question) return null;
          const selectedOption = question.options.find((o) => o.id === result.selectedOptionId);
          const correctOption = question.options.find((o) => o.isCorrect);

          return (
            <Card key={result.questionId} className="p-4">
              <div className="flex items-start gap-3">
                {result.isCorrect ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-correct-600 dark:text-correct-500" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-incorrect-600 dark:text-incorrect-500" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{question.text}</p>
                  <p
                    className={cn(
                      "mt-1 text-sm",
                      result.isCorrect
                        ? "text-correct-600 dark:text-correct-500"
                        : "text-incorrect-600 dark:text-incorrect-500",
                    )}
                  >
                    Your answer: {selectedOption?.text ?? "Skipped"}
                  </p>
                  {!result.isCorrect && (
                    <p className="text-sm text-correct-600 dark:text-correct-500">
                      Correct answer: {correctOption?.text}
                    </p>
                  )}
                  {question.correctExplanation && (
                    <p className="mt-1.5 text-xs text-muted-foreground">{question.correctExplanation}</p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
