import { useState } from "react";
import { ArrowUpDown, SlidersHorizontal, X } from "lucide-react";
import type { DifficultyLevel, ResourceCategory, ResourceSortBy } from "@placeprep/shared";
import { RESOURCE_CATEGORIES } from "@placeprep/shared";
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
import { Badge } from "@/components/ui/badge";

const DIFFICULTIES: DifficultyLevel[] = ["easy", "medium", "hard"];

const SORT_LABEL: Record<ResourceSortBy, string> = {
  newest: "Newest",
  "most-downloaded": "Most downloaded",
  "most-bookmarked": "Most bookmarked",
};

export interface ResourceFilterState {
  category?: ResourceCategory;
  difficulty?: DifficultyLevel;
  subjectId?: string;
  topicId?: string;
  companyId?: string;
  tags: string[];
  sortBy: ResourceSortBy;
}

interface ResourceFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: ResourceFilterState;
  onChange: (next: Partial<ResourceFilterState>) => void;
  subjectOptions: { id: string; name: string }[];
  topicOptions: { id: string; name: string }[];
  companyOptions: { id: string; name: string }[];
}

export function ResourceFilters({
  search,
  onSearchChange,
  filters,
  onChange,
  subjectOptions,
  topicOptions,
  companyOptions,
}: ResourceFiltersProps) {
  const [tagInput, setTagInput] = useState("");

  const activeFilterCount =
    (filters.category ? 1 : 0) +
    (filters.difficulty ? 1 : 0) +
    (filters.subjectId ? 1 : 0) +
    (filters.topicId ? 1 : 0) +
    (filters.companyId ? 1 : 0) +
    filters.tags.length;

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !filters.tags.includes(tag)) {
      onChange({ tags: [...filters.tags, tag] });
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    onChange({ tags: filters.tags.filter((t) => t !== tag) });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBar
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search resources by title or description..."
          containerClassName="flex-1"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="md">
              <ArrowUpDown className="size-4" />
              {SORT_LABEL[filters.sortBy]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {(Object.keys(SORT_LABEL) as ResourceSortBy[]).map((option) => (
              <DropdownMenuItem key={option} onClick={() => onChange({ sortBy: option })}>
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
            <DropdownMenuLabel>Category</DropdownMenuLabel>
            {RESOURCE_CATEGORIES.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.value}
                checked={filters.category === c.value}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onChange({ category: filters.category === c.value ? undefined : c.value })}
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Difficulty</DropdownMenuLabel>
            {DIFFICULTIES.map((d) => (
              <DropdownMenuCheckboxItem
                key={d}
                checked={filters.difficulty === d}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onChange({ difficulty: filters.difficulty === d ? undefined : d })}
                className="capitalize"
              >
                {d}
              </DropdownMenuCheckboxItem>
            ))}

            {subjectOptions.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Subject</DropdownMenuLabel>
                {subjectOptions.map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s.id}
                    checked={filters.subjectId === s.id}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() =>
                      onChange({
                        subjectId: filters.subjectId === s.id ? undefined : s.id,
                        topicId: undefined,
                      })
                    }
                  >
                    {s.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            )}

            {filters.subjectId && topicOptions.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Topic</DropdownMenuLabel>
                {topicOptions.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={filters.topicId === t.id}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => onChange({ topicId: filters.topicId === t.id ? undefined : t.id })}
                  >
                    {t.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            )}

            {companyOptions.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Company</DropdownMenuLabel>
                {companyOptions.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={filters.companyId === c.id}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => onChange({ companyId: filters.companyId === c.id ? undefined : c.id })}
                  >
                    {c.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Filter by tag, press Enter..."
          className="h-8 w-48 rounded-md border border-border-subtle bg-surface px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent-600"
        />
        {filters.tags.map((tag) => (
          <Badge key={tag} variant="accent" className="gap-1">
            #{tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(tag)}
              className="rounded-full hover:bg-accent-600/20"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
