import * as React from "react";
import { Building2 } from "lucide-react";
import { useCompanies } from "@/hooks/use-companies";
import { CompanyCard } from "@/components/companies/company-card";
import { SearchBar } from "@/components/ui/search-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

export function CompaniesPage() {
  const [search, setSearch] = React.useState("");
  const { data, isLoading, isError, refetch } = useCompanies();
  const companies = data?.items ?? [];

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Companies</h1>
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading…"
            : `Preparation hubs for ${companies.length} compan${companies.length === 1 ? "y" : "ies"} with questions in the bank.`}
        </p>
      </div>

      <SearchBar
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search companies..."
        containerClassName="max-w-sm"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load companies." onRetry={() => refetch()} />
      ) : companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies yet"
          description="Companies appear automatically once a placement PDF that mentions them has been processed."
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} title="No companies match your search" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}
    </div>
  );
}
