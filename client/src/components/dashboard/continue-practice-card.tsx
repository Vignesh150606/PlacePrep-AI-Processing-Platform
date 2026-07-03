import { Link } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { mockQuizzes } from "@/mocks/quizzes";
import { mockCompanies } from "@/mocks/companies";

export function ContinuePracticeCard() {
  const quiz = mockQuizzes[0];
  const company = quiz?.companyId
    ? mockCompanies.find((c) => c.id === quiz.companyId)
    : undefined;

  if (!quiz) return null;

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-accent-600/10 via-transparent to-transparent" />
      <CardContent className="relative flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Continue practice
          </p>
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent-600/15 text-accent-600 dark:text-accent-400">
            <Play className="size-4" />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{quiz.title}</p>
          <p className="text-sm text-muted-foreground">
            {quiz.questionCount} questions{company ? ` · ${company.name}` : ""}
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
