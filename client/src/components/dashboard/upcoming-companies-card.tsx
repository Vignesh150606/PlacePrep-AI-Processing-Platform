import { Link } from "@tanstack/react-router";
import { Building2, CalendarClock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { mockCompanies } from "@/mocks/companies";
import { formatDate } from "@/lib/format";

export function UpcomingCompaniesCard() {
  const upcoming = mockCompanies
    .filter((c) => c.upcomingVisitDate)
    .sort((a, b) => (a.upcomingVisitDate! < b.upcomingVisitDate! ? -1 : 1))
    .slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming companies</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {upcoming.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No upcoming visits" className="border-none py-6" />
        ) : (
          upcoming.map((company) => (
            <Link
              key={company.id}
              to="/companies/$slug"
              params={{ slug: company.slug }}
              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                <Building2 className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{company.name}</p>
                <p className="text-xs text-muted-foreground">{company.roles[0]}</p>
              </div>
              <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatDate(company.upcomingVisitDate!)}
              </p>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
