import { COMMUNITY_CATEGORIES, COMMUNITY_SORT_OPTIONS } from "@placeprep/shared";
import type { CommunityCategory, CommunitySortOption } from "@placeprep/shared";
import { SearchBar } from "@/components/ui/search-bar";

const selectClass =
  "h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface CommunityFilterState {
  category?: CommunityCategory;
  companyId?: string;
  sortBy: CommunitySortOption;
}

interface CommunityPostFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: CommunityFilterState;
  onChange: (next: Partial<CommunityFilterState>) => void;
  companyOptions: { id: string; name: string }[];
}

export function CommunityPostFilters({
  search,
  onSearchChange,
  filters,
  onChange,
  companyOptions,
}: CommunityPostFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchBar
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search discussions..."
        containerClassName="min-w-64 flex-1"
      />
      <select
        className={selectClass}
        value={filters.category ?? ""}
        onChange={(e) => onChange({ category: (e.target.value || undefined) as CommunityCategory | undefined })}
      >
        <option value="">All categories</option>
        {COMMUNITY_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={filters.companyId ?? ""}
        onChange={(e) => onChange({ companyId: e.target.value || undefined })}
      >
        <option value="">All companies</option>
        {companyOptions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={filters.sortBy}
        onChange={(e) => onChange({ sortBy: e.target.value as CommunitySortOption })}
      >
        {COMMUNITY_SORT_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
