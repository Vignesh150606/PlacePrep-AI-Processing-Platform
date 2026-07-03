import { Bookmark } from "lucide-react";
import type { Question } from "@placeprep/shared";
import { Card } from "@/components/ui/card";
import { Badge, DifficultyBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockCompanies } from "@/mocks/companies";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface QuestionCardProps {
  question: Question;
  isBookmarked?: boolean;
  onToggleBookmark?: (questionId: string) => void;
}

export function QuestionCard({ question, isBookmarked, onToggleBookmark }: QuestionCardProps) {
  const company = question.companyId
    ? mockCompanies.find((c) => c.id === question.companyId)
    : undefined;
  const accuracy =
    question.timesAttempted > 0 ? (question.timesCorrect / question.timesAttempted) * 100 : null;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <DifficultyBadge difficulty={question.difficulty} />
          <Badge variant="neutral">{question.subject}</Badge>
          <Badge variant="accent">{question.topic}</Badge>
          {company && <Badge variant="neutral">{company.name}</Badge>}
          {question.status === "pending-review" && (
            <Badge variant="warning">Pending review</Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isBookmarked ? "Remove bookmark" : "Bookmark question"}
          aria-pressed={isBookmarked}
          onClick={() => onToggleBookmark?.(question.id)}
        >
          <Bookmark className={cn("size-4", isBookmarked && "fill-accent-600 text-accent-600")} />
        </Button>
      </div>

      <p className="text-sm font-medium leading-relaxed text-foreground">{question.text}</p>

      <ul className="flex flex-col gap-1.5">
        {question.options.map((option) => (
          <li
            key={option.id}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
              option.isCorrect
                ? "border-correct-500/30 bg-correct-500/5 text-correct-700 dark:text-correct-500"
                : "border-border-subtle text-muted-foreground",
            )}
          >
            <span className="font-medium">{option.label}.</span>
            {option.text}
          </li>
        ))}
      </ul>

      {accuracy !== null && (
        <p className="text-xs text-muted-foreground">
          {formatPercent(accuracy)} of students answer this correctly · {question.timesAttempted} attempts
        </p>
      )}
    </Card>
  );
}
