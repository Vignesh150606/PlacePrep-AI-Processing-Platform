import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuestions } from "@/hooks/use-questions";

/**
 * FIX: this used to render mocks/quizzes.ts as if the user had a real
 * in-progress quiz ("Resume quiz — Amazon SDE-1"). There's no Quiz Attempt
 * backend yet (Sprint 5 — Quiz Engine / Learning Experience), so there is no
 * real quiz to resume. This is an honest CTA into real question-bank data
 * instead of a fabricated "continue where you left off" card.
 */
export function ContinuePracticeCard() {
  const { data } = useQuestions();
  const count = data?.total ?? 0;

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
