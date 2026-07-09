import { Link } from "@tanstack/react-router";
import { ArrowRight, History, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuestions } from "@/hooks/use-questions";
import { useInProgressAttempt } from "@/hooks/use-quiz-attempts";

export function ContinuePracticeCard() {
  const { data } = useQuestions();
  const { data: inProgress } = useInProgressAttempt();
  const count = data?.total ?? 0;

  if (inProgress) {
    return (
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-warning-500/10 via-transparent to-transparent" />
        <CardContent className="relative flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Practice</p>
            <div className="flex size-8 items-center justify-center rounded-lg bg-warning-500/15 text-warning-500">
              <History className="size-4" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Resume your quiz</p>
            <p className="text-sm text-muted-foreground">
              {inProgress.questionIds.length} question{inProgress.questionIds.length === 1 ? "" : "s"} left in progress
            </p>
          </div>
          <Button asChild size="sm" className="w-fit">
            <Link to="/quiz">
              Resume quiz
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-accent-600/10 via-transparent to-transparent" />
      <CardContent className="relative flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Practice</p>
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent-600/15 text-accent-600 dark:text-accent-400">
            <Sparkles className="size-4" />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {count > 0 ? "Start a practice quiz" : "Upload a PDF to get started"}
          </p>
          <p className="text-sm text-muted-foreground">
            {count > 0
              ? `${count} question${count === 1 ? "" : "s"} available in the bank`
              : "Extracted questions will appear here"}
          </p>
        </div>
        <Button asChild size="sm" className="w-fit">
          <Link to={count > 0 ? "/quiz" : "/pdfs"}>
            {count > 0 ? "Start quiz" : "Go to PDF Library"}
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
