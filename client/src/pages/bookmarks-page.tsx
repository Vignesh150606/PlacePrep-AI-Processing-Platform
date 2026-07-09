import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Bookmark as BookmarkIcon, Sparkles } from "lucide-react";
import { useQuestions } from "@/hooks/use-questions";
import { useCompanies } from "@/hooks/use-companies";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { QuestionCard } from "@/components/questions/question-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SlidersHorizontal } from "lucide-react";

/** Module 5 — Bookmarks. Reads the real `/bookmarks` backend (see use-bookmarks.ts). */
export function BookmarksPage() {
  const { data: questionData, isLoading: questionsLoading, isError, refetch } = useQuestions();
  const { data: companyData } = useCompanies();
  const { bookmarks, isBookmarked, toggle, isLoading: bookmarksLoading } = useBookmarks();

  const [selectedSubjects, setSelectedSubjects] = React.useState<string[]>([]);

  const questionById = new Map((questionData?.items ?? []).map((q) => [q.id, q]));
  const companyNameById = new Map((companyData?.items ?? []).map((c) => [c.id, c.name]));

  const bookmarkedQuestions = bookmarks
    .filter((b) => b.targetType === "question")
    .map((b) => questionById.get(b.targetId))
    .filter((q): q is NonNullable<typeof q> => Boolean(q));

  const availableSubjects = Array.from(new Set(bookmarkedQuestions.map((q) => q.subject))).sort();
  const visible =
    selectedSubjects.length === 0
      ? bookmarkedQuestions
      : bookmarkedQuestions.filter((q) => selectedSubjects.includes(q.subject));

  const isLoading = questionsLoading || bookmarksLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Bookmarks</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${visible.length} bookmarked question${visible.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <div className="flex gap-2">
          {availableSubjects.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <SlidersHorizontal className="size-3.5" />
                  Filter by subject
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Subject</DropdownMenuLabel>
                {availableSubjects.map((subject) => (
                  <DropdownMenuCheckboxItem
                    key={subject}
                    checked={selectedSubjects.includes(subject)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() =>
                      setSelectedSubjects((prev) =>
                        prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject],
                      )
                    }
                  >
                    {subject}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {visible.length > 0 && (
            <Button asChild size="sm">
              <Link to="/quiz">
                <Sparkles className="size-3.5" />
                Practice bookmarks
              </Link>
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load the question bank." onRetry={() => refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={BookmarkIcon}
          title={bookmarkedQuestions.length === 0 ? "No bookmarks yet" : "No bookmarks match this filter"}
          description="Bookmark questions from the Question Bank, a company page, or the Wrong Answer Notebook to save them here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              companyName={question.companyId ? companyNameById.get(question.companyId) : null}
              isBookmarked={isBookmarked(question.id)}
              onToggleBookmark={(id) => toggle(id, "question")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
