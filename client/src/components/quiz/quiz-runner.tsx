import * as React from "react";
import type { Question } from "@placeprep/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface QuizRunnerResult {
  questionId: string;
  selectedOptionId: string | null;
  isCorrect: boolean;
}

interface QuizRunnerProps {
  questions: Question[];
  onComplete: (results: QuizRunnerResult[]) => void;
}

export function QuizRunner({ questions, onComplete }: QuizRunnerProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [selectedOptionId, setSelectedOptionId] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<QuizRunnerResult[]>([]);

  const question = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;

  if (!question) return null;

  function handleNext() {
    const selectedOption = question.options.find((o) => o.id === selectedOptionId);
    const nextResults = [
      ...results,
      {
        questionId: question.id,
        selectedOptionId,
        isCorrect: Boolean(selectedOption?.isCorrect),
      },
    ];

    if (isLast) {
      onComplete(nextResults);
      return;
    }

    setResults(nextResults);
    setCurrentIndex((i) => i + 1);
    setSelectedOptionId(null);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Question {currentIndex + 1} of {questions.length}
          </p>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-accent-600 transition-all"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        <p className="text-base font-medium leading-relaxed text-foreground">{question.text}</p>

        <div role="radiogroup" aria-label="Answer options" className="flex flex-col gap-2">
          {question.options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selectedOptionId === option.id}
              onClick={() => setSelectedOptionId(option.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selectedOptionId === option.id
                  ? "border-accent-600 bg-accent-600/10 text-foreground"
                  : "border-border text-foreground hover:bg-surface",
              )}
            >
              <span className="font-medium text-muted-foreground">{option.label}.</span>
              {option.text}
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleNext} disabled={!selectedOptionId}>
            {isLast ? "Submit quiz" : "Next question"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
