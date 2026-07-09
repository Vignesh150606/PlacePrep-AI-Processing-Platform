import * as React from "react";
import type { DifficultyLevel, Question } from "@placeprep/shared";

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export type QuestionSortBy = "recent" | "difficulty" | "most-attempted" | "accuracy";

const DIFFICULTY_RANK: Record<DifficultyLevel, number> = { easy: 0, medium: 1, hard: 2 };

const PAGE_SIZE = 12;

export function useQuestionFilters(questions: Question[]) {
  const [search, setSearch] = React.useState("");
  const [selectedDifficulties, setSelectedDifficulties] = React.useState<DifficultyLevel[]>([]);
  const [selectedSubjects, setSelectedSubjects] = React.useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = React.useState<string[]>([]);
  const [sourcePdfId, setSourcePdfId] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<QuestionSortBy>("recent");
  const [page, setPage] = React.useState(1);

  const availableSubjects = React.useMemo(
    () => Array.from(new Set(questions.map((q) => q.subject).filter(Boolean))).sort(),
    [questions],
  );

  const availableTopics = React.useMemo(
    () => Array.from(new Set(questions.map((q) => q.topic).filter(Boolean))).sort(),
    [questions],
  );

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = questions.filter((q) => {
      if (query && !q.text.toLowerCase().includes(query) && !q.topic.toLowerCase().includes(query)) {
        return false;
      }
      if (selectedDifficulties.length > 0 && !selectedDifficulties.includes(q.difficulty)) {
        return false;
      }
      if (selectedSubjects.length > 0 && !selectedSubjects.includes(q.subject)) {
        return false;
      }
      if (selectedTopics.length > 0 && !selectedTopics.includes(q.topic)) {
        return false;
      }
      if (sourcePdfId && q.sourcePdfId !== sourcePdfId) {
        return false;
      }
      return true;
    });

    const sorted = [...rows].sort((a, b) => {
      switch (sortBy) {
        case "difficulty":
          return DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty];
        case "most-attempted":
          return b.timesAttempted - a.timesAttempted;
        case "accuracy": {
          const accA = a.timesAttempted > 0 ? a.timesCorrect / a.timesAttempted : -1;
          const accB = b.timesAttempted > 0 ? b.timesCorrect / b.timesAttempted : -1;
          return accB - accA;
        }
        case "recent":
        default:
          return a.createdAt < b.createdAt ? 1 : -1;
      }
    });

    return sorted;
  }, [questions, search, selectedDifficulties, selectedSubjects, selectedTopics, sourcePdfId, sortBy]);

  // Any change to the filter set should reset paging back to page 1.
  React.useEffect(() => {
    setPage(1);
  }, [search, selectedDifficulties, selectedSubjects, selectedTopics, sourcePdfId, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const paginated = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  return {
    search,
    setSearch,
    selectedDifficulties,
    toggleDifficulty: (d: DifficultyLevel) =>
      setSelectedDifficulties((prev) => toggleInArray(prev, d)),
    selectedSubjects,
    toggleSubject: (s: string) => setSelectedSubjects((prev) => toggleInArray(prev, s)),
    selectedTopics,
    toggleTopic: (t: string) => setSelectedTopics((prev) => toggleInArray(prev, t)),
    availableSubjects,
    availableTopics,
    sourcePdfId,
    setSourcePdfId,
    sortBy,
    setSortBy,
    filtered,
    paginated,
    page: clampedPage,
    totalPages,
    setPage,
    pageSize: PAGE_SIZE,
  };
}
