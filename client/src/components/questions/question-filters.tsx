import { SearchBar } from "@/components/ui/search-bar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";
import type { DifficultyLevel } from "@placeprep/shared";

interface QuestionFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  selectedDifficulties: DifficultyLevel[];
  onToggleDifficulty: (difficulty: DifficultyLevel) => void;
  selectedSubjects: string[];
  onToggleSubject: (subject: string) => void;
  availableSubjects: string[];
}

const DIFFICULTIES: DifficultyLevel[] = ["easy", "medium", "hard"];

export function QuestionFilters({
  search,
  onSearchChange,
  selectedDifficulties,
  onToggleDifficulty,
  selectedSubjects,
  onToggleSubject,
  availableSubjects,
}: QuestionFiltersProps) {
  const activeFilterCount = selectedDifficulties.length + selectedSubjects.length;

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
            <SlidersHorizontal className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-accent-600 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
