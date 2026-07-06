import * as React from "react";
import { toast } from "sonner";
import { useQuestions } from "@/hooks/use-questions";
import { QuizConfigForm, type QuizConfig } from "@/components/quiz/quiz-config-form";
import { QuizRunner, type QuizRunnerResult } from "@/components/quiz/quiz-runner";
import { QuizResult } from "@/components/quiz/quiz-result";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardX, Sparkles } from "lucide-react";
import type { Question } from "@placeprep/shared";

type QuizStage =
  | { step: "config" }
  | { step: "active"; questions: Question[] }
  | { step: "results"; questions: Question[]; results: QuizRunnerResult[] };

function selectQuestions(pool: Question[], config: QuizConfig): Question[] {
  let filtered = pool;

  if (config.mode === "topic" && config.topic) {
    filtered = filtered.filter((q) => q.topic === config.topic);
  } else if (config.mode === "company" && config.companyId) {
    filtered = filtered.filter((q) => q.companyId === config.companyId);
  }

  return filtered.slice(0, config.questionCount);
}

export function QuizPage() {
  const { data, isLoading, isError, refetch } = useQuestions();
  const allQuestions = data?.items ?? [];
  const [stage, setStage] = React.useState<QuizStage>({ step: "config" });

  function handleStart(config: QuizConfig) {
    const questions = selectQuestions(allQuestions, config);
    if (questions.length === 0) {
      toast.error("No questions match that configuration. Try a different topic or company.");
      return;
    }
    setStage({ step: "active", questions });
  }

  function handleComplete(results: QuizRunnerResult[], questions: Question[]) {
    setStage({ step: "results", questions, results });
    const correctCount = results.filter((r) => r.isCorrect).length;
    toast.success(`Quiz complete — ${correctCount}/${results.length} correct`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Quiz</h1>
        <p className="text-sm text-muted-foreground">
          Generate a practice quiz from the question bank.
        </p>
      </div>

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
          <QuizConfigForm onStart={handleStart} />
        ))}

      {stage.step === "active" &&
        (stage.questions.length === 0 ? (
          <EmptyState icon={ClipboardX} title="No questions available" />
        ) : (
          <QuizRunner
            questions={stage.questions}
            onComplete={(results) => handleComplete(results, stage.questions)}
          />
        ))}

      {stage.step === "results" && (
        <QuizResult
          questions={stage.questions}
          results={stage.results}
          onRetry={() => setStage({ step: "config" })}
        />
      )}
    </div>
  );
}
