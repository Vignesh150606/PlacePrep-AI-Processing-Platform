import { Bookmark, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Question } from "@placeprep/shared";
import { Card } from "@/components/ui/card";
import { Badge, DifficultyBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-profile";
import { useReviewQuestion } from "@/hooks/use-admin-questions";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface QuestionCardProps {
  question: Question;
  /**
   * Resolved company display name. Passed in by the parent (which already
   * has the real company list loaded) instead of this component looking it
   * up in mocks/companies.ts — real question.companyId values are DB UUIDs
   * and never matched the old mock ids anyway.
   */
  companyName?: string | null;
  /** Resolved source PDF file name, if this question was extracted from one. */
  sourcePdfName?: string | null;
  isBookmarked?: boolean;
  onToggleBookmark?: (questionId: string) => void;
}

/**
 * The admin-only Delete icon here is deliberately in EVERY page that
 * renders a `QuestionCard` (Question Bank, Wrong Answers, Company detail,
 * Bookmarks) rather than only on the separate "Manage Questions" admin
 * page (`/admin/review`) -- an admin who spots a wrongly-added question
 * while just browsing shouldn't have to leave that page, search for the
 * same question again elsewhere, and delete it from there. It calls the
 * exact same soft-delete endpoint `/admin/review`'s own Delete button
 * uses (`useReviewQuestion().remove` -> `DELETE /questions/{id}`), so a
 * question deleted from here shows up, and can be restored, from Manage
 * Questions' Deleted tab exactly the same way.
 */
export function QuestionCard({
  question,
  companyName,
  sourcePdfName,
  isBookmarked,
  onToggleBookmark,
}: QuestionCardProps) {
  const accuracy =
    question.timesAttempted > 0 ? (question.timesCorrect / question.timesAttempted) * 100 : null;
  const isAdmin = useIsAdmin();
  const { remove } = useReviewQuestion();

  function handleDelete() {
    if (!window.confirm("Delete this question? You can restore it later from Manage Questions → Deleted.")) return;
    remove.mutate(question.id, { onSuccess: () => toast.success("Question deleted.") });
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <DifficultyBadge difficulty={question.difficulty} />
          {question.subject && <Badge variant="neutral">{question.subject}</Badge>}
          {question.topic && <Badge variant="accent">{question.topic}</Badge>}
          {companyName && <Badge variant="neutral">{companyName}</Badge>}
          {question.status === "pending-review" && (
            <Badge variant="warning">Pending review</Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark question"}
            aria-pressed={isBookmarked}
            onClick={() => onToggleBookmark?.(question.id)}
          >
            <Bookmark className={cn("size-4", isBookmarked && "fill-accent-600 text-accent-600")} />
          </Button>
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete question"
              title="Delete question"
              disabled={remove.isPending}
              onClick={handleDelete}
              className="text-incorrect-600 hover:text-incorrect-700"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
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

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {accuracy !== null
            ? `${formatPercent(accuracy)} of students answer this correctly · ${question.timesAttempted} attempts`
            : "Not attempted yet"}
        </span>
        {sourcePdfName && (
          <span className="flex items-center gap-1" title={sourcePdfName}>
            <FileText className="size-3.5" />
            <span className="max-w-40 truncate">{sourcePdfName}</span>
            {question.pageNumber && <span>· p.{question.pageNumber}</span>}
          </span>
        )}
      </div>
    </Card>
  );
}
