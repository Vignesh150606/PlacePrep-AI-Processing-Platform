import * as React from "react";
import { Building2 } from "lucide-react";
import { mockCompanies } from "@/mocks/companies";
import { CompanyCard } from "@/components/companies/company-card";
import { SearchBar } from "@/components/ui/search-bar";
import { EmptyState } from "@/components/ui/empty-state";

export function CompaniesPage() {
  const [search, setSearch] = React.useState("");

  const filtered = mockCompanies.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Companies</h1>
        <p className="text-sm text-muted-foreground">
          Preparation hubs for {mockCompanies.length} companies actively recruiting on campus.
        </p>
      </div>

      <SearchBar
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search companies..."
        containerClassName="max-w-sm"
      />

      {filtered.length === 0 ? (
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
