import { BookOpenText } from "lucide-react";
import { mockQuestions } from "@/mocks/questions";
import { useQuestionFilters } from "@/hooks/use-question-filters";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { QuestionFilters } from "@/components/questions/question-filters";
import { QuestionCard } from "@/components/questions/question-card";
import { EmptyState } from "@/components/ui/empty-state";

export function QuestionBankPage() {
  const {
    search,
    setSearch,
    selectedDifficulties,
    toggleDifficulty,
    selectedSubjects,
    toggleSubject,
    availableSubjects,
    filtered,
  } = useQuestionFilters(mockQuestions);
  const { isBookmarked, toggle } = useBookmarks();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Question Bank</h1>
        <p className="text-sm text-muted-foreground">
          {mockQuestions.length} questions extracted from placement PDFs and community contributions.
        </p>
      </div>

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
              isBookmarked={isBookmarked(question.id)}
              onToggleBookmark={(id) => toggle(id, "question")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
