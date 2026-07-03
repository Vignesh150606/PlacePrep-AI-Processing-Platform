import * as React from "react";
import { toast } from "sonner";
import { mockQuestions } from "@/mocks/questions";
import { QuizConfigForm, type QuizConfig } from "@/components/quiz/quiz-config-form";
import { QuizRunner, type QuizRunnerResult } from "@/components/quiz/quiz-runner";
import { QuizResult } from "@/components/quiz/quiz-result";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardX } from "lucide-react";
import type { Question } from "@placeprep/shared";

type QuizStage =
  | { step: "config" }
  | { step: "active"; questions: Question[] }
  | { step: "results"; questions: Question[]; results: QuizRunnerResult[] };

function selectQuestions(config: QuizConfig): Question[] {
  let pool = mockQuestions;

  if (config.mode === "topic" && config.topic) {
    pool = pool.filter((q) => q.topic === config.topic);
  } else if (config.mode === "company" && config.companyId) {
    pool = pool.filter((q) => q.companyId === config.companyId);
  }

  return pool.slice(0, config.questionCount);
}

export function QuizPage() {
  const [stage, setStage] = React.useState<QuizStage>({ step: "config" });

  function handleStart(config: QuizConfig) {
    const questions = selectQuestions(config);
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

      {stage.step === "config" && <QuizConfigForm onStart={handleStart} />}

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
