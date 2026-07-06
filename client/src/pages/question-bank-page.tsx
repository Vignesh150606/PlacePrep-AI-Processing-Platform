import { BookOpenText } from "lucide-react";
import { useQuestions } from "@/hooks/use-questions";
import { useCompanies } from "@/hooks/use-companies";
import { useQuestionFilters } from "@/hooks/use-question-filters";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { QuestionFilters } from "@/components/questions/question-filters";
import { QuestionCard } from "@/components/questions/question-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

export function QuestionBankPage() {
  const { data, isLoading, isError, refetch } = useQuestions();
  const { data: companyData } = useCompanies();
  const questions = data?.items ?? [];
  const companyNameById = new Map((companyData?.items ?? []).map((c) => [c.id, c.name]));

  const {
    search,
    setSearch,
    selectedDifficulties,
    toggleDifficulty,
    selectedSubjects,
    toggleSubject,
    availableSubjects,
    filtered,
  } = useQuestionFilters(questions);
  const { isBookmarked, toggle } = useBookmarks();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Question Bank</h1>
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading…"
            : `${questions.length} question${questions.length === 1 ? "" : "s"} extracted from placement PDFs.`}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load the question bank." onRetry={() => refetch()} />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={BookOpenText}
          title="No questions yet"
          description="Upload a placement PDF in the PDF Library — extracted questions will show up here automatically once processing finishes."
        />
      ) : (
        <>
          <QuestionFilters
            search={search}
            onSearchChange={setSearch}
            selectedDifficulties={selectedDifficulties}
            onToggleDifficulty={toggleDifficulty}
            selectedSubjects={selectedSubjects}
            onToggleSubject={toggleSubject}
            availableSubjects={availableSubjects}
          />

          {filtered.length === 0 ? (
            <EmptyState
              icon={BookOpenText}
              title="No questions match your filters"
              description="Try a different search term or clear a filter."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filtered.map((question) => (
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
        </>
      )}
    </div>
  );
}
