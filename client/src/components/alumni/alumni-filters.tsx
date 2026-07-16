import type { AlumniSortBy } from "@placeprep/shared";
import { ArrowUpDown, SlidersHorizontal } from "lucide-react";
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

const SORT_LABEL: Record<AlumniSortBy, string> = {
  newest: "Newest",
  "most-helpful": "Most helpful",
  "most-contributions": "Most contributions",
};

export interface AlumniFilterState {
  companyId?: string;
  department?: string;
  graduationYear?: number;
  mentorshipAvailable?: boolean;
  sortBy: AlumniSortBy;
}

interface AlumniFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: AlumniFilterState;
  onChange: (next: Partial<AlumniFilterState>) => void;
  companyOptions: { id: string; name: string }[];
  departmentOptions: string[];
  graduationYearOptions: number[];
}

export function AlumniFilters({
  search,
  onSearchChange,
  filters,
  onChange,
  companyOptions,
  departmentOptions,
  graduationYearOptions,
}: AlumniFiltersProps) {
  const activeFilterCount =
    (filters.companyId ? 1 : 0) +
    (filters.department ? 1 : 0) +
    (filters.graduationYear ? 1 : 0) +
    (filters.mentorshipAvailable ? 1 : 0);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <SearchBar
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search alumni by name, role, or company..."
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
          {(Object.keys(SORT_LABEL) as AlumniSortBy[]).map((option) => (
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
          <DropdownMenuCheckboxItem
            checked={!!filters.mentorshipAvailable}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onChange({ mentorshipAvailable: filters.mentorshipAvailable ? undefined : true })}
          >
            Open to mentor
          </DropdownMenuCheckboxItem>

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

          {departmentOptions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Department</DropdownMenuLabel>
              {departmentOptions.map((d) => (
                <DropdownMenuCheckboxItem
                  key={d}
                  checked={filters.department === d}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => onChange({ department: filters.department === d ? undefined : d })}
                >
                  {d}
                </DropdownMenuCheckboxItem>
              ))}
            </>
          )}

          {graduationYearOptions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Graduation year</DropdownMenuLabel>
              {graduationYearOptions.map((y) => (
                <DropdownMenuCheckboxItem
                  key={y}
                  checked={filters.graduationYear === y}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => onChange({ graduationYear: filters.graduationYear === y ? undefined : y })}
                >
                  {y}
                </DropdownMenuCheckboxItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
