import * as React from "react";
import type { DifficultyLevel, Question } from "@placeprep/shared";

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function useQuestionFilters(questions: Question[]) {
  const [search, setSearch] = React.useState("");
  const [selectedDifficulties, setSelectedDifficulties] = React.useState<DifficultyLevel[]>([]);
  const [selectedSubjects, setSelectedSubjects] = React.useState<string[]>([]);

  const availableSubjects = React.useMemo(
    () => Array.from(new Set(questions.map((q) => q.subject))).sort(),
    [questions],
  );

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return questions.filter((q) => {
      if (query && !q.text.toLowerCase().includes(query) && !q.topic.toLowerCase().includes(query)) {
        return false;
      }
      if (selectedDifficulties.length > 0 && !selectedDifficulties.includes(q.difficulty)) {
        return false;
      }
      if (selectedSubjects.length > 0 && !selectedSubjects.includes(q.subject)) {
        return false;
      }
      return true;
    });
  }, [questions, search, selectedDifficulties, selectedSubjects]);

  return {
    search,
    setSearch,
    selectedDifficulties,
    toggleDifficulty: (d: DifficultyLevel) =>
      setSelectedDifficulties((prev) => toggleInArray(prev, d)),
    selectedSubjects,
    toggleSubject: (s: string) => setSelectedSubjects((prev) => toggleInArray(prev, s)),
    availableSubjects,
    filtered,
  };
}
