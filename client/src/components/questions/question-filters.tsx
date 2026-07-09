import { SearchBar } from "@/components/ui/search-bar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, SlidersHorizontal } from "lucide-react";
import type { DifficultyLevel } from "@placeprep/shared";
import type { QuestionSortBy } from "@/hooks/use-question-filters";

interface QuestionFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  selectedDifficulties: DifficultyLevel[];
  onToggleDifficulty: (difficulty: DifficultyLevel) => void;
  selectedSubjects: string[];
  onToggleSubject: (subject: string) => void;
  availableSubjects: string[];
  selectedTopics: string[];
  onToggleTopic: (topic: string) => void;
  availableTopics: string[];
  sortBy: QuestionSortBy;
  onSortChange: (sort: QuestionSortBy) => void;
  sourcePdfId: string | null;
  onSourcePdfChange: (id: string | null) => void;
  sourcePdfOptions: { id: string; label: string }[];
}

const DIFFICULTIES: DifficultyLevel[] = ["easy", "medium", "hard"];

const SORT_LABEL: Record<QuestionSortBy, string> = {
  recent: "Recently added",
  difficulty: "Difficulty (easy → hard)",
  "most-attempted": "Most attempted",
  accuracy: "Highest accuracy",
};

export function QuestionFilters({
  search,
  onSearchChange,
  selectedDifficulties,
  onToggleDifficulty,
  selectedSubjects,
  onToggleSubject,
  availableSubjects,
  selectedTopics,
  onToggleTopic,
  availableTopics,
  sortBy,
  onSortChange,
  sourcePdfId,
  onSourcePdfChange,
  sourcePdfOptions,
}: QuestionFiltersProps) {
  const activeFilterCount =
    selectedDifficulties.length + selectedSubjects.length + selectedTopics.length + (sourcePdfId ? 1 : 0);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <SearchBar
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search questions by keyword or topic..."
        containerClassName="flex-1"
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="md">
            <ArrowUpDown className="size-4" />
            {SORT_LABEL[sortBy]}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {(Object.keys(SORT_LABEL) as QuestionSortBy[]).map((option) => (
            <DropdownMenuItem key={option} onClick={() => onSortChange(option)}>
              {SORT_LABEL[option]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="md">
            <SlidersHorizontal className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-accent-600 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Difficulty</DropdownMenuLabel>
          {DIFFICULTIES.map((difficulty) => (
            <DropdownMenuCheckboxItem
              key={difficulty}
              checked={selectedDifficulties.includes(difficulty)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onToggleDifficulty(difficulty)}
              className="capitalize"
            >
              {difficulty}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Subject</DropdownMenuLabel>
          {availableSubjects.map((subject) => (
            <DropdownMenuCheckboxItem
              key={subject}
              checked={selectedSubjects.includes(subject)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onToggleSubject(subject)}
            >
              {subject}
            </DropdownMenuCheckboxItem>
          ))}
          {availableTopics.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Topic</DropdownMenuLabel>
              {availableTopics.map((topic) => (
                <DropdownMenuCheckboxItem
                  key={topic}
                  checked={selectedTopics.includes(topic)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => onToggleTopic(topic)}
                >
                  {topic}
                </DropdownMenuCheckboxItem>
              ))}
            </>
          )}
          {sourcePdfOptions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Source PDF</DropdownMenuLabel>
              {sourcePdfOptions.map((opt) => (
                <DropdownMenuCheckboxItem
                  key={opt.id}
                  checked={sourcePdfId === opt.id}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => onSourcePdfChange(sourcePdfId === opt.id ? null : opt.id)}
                  className="max-w-56 truncate"
                >
                  {opt.label}
                </DropdownMenuCheckboxItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
