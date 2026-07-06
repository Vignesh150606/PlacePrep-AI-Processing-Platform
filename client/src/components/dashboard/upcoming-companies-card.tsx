import { Link } from "@tanstack/react-router";
import { Building2, CalendarClock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanies } from "@/hooks/use-companies";
import { formatDate } from "@/lib/format";

/**
 * FIX: this used to read mocks/companies.ts, showing invented placement
 * dates ("Infosys OA tomorrow") that never happened. Now reads the real
 * `companies` table. Nothing currently writes `upcoming_visit_date` (the
 * classification step only sets name/slug/tier), so this will honestly show
 * the empty state until that becomes a real feature — which is correct:
 * an empty state beats a fabricated schedule.
 */
export function UpcomingCompaniesCard() {
  const { data, isLoading } = useCompanies();
  const upcoming = (data?.items ?? [])
    .filter((c) => c.upcomingVisitDate)
    .sort((a, b) => (a.upcomingVisitDate! < b.upcomingVisitDate! ? -1 : 1))
    .slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming companies</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {isLoading ? (
          <div className="flex flex-col gap-2 py-1">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No upcoming visits scheduled" className="border-none py-6" />
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
                <p className="text-xs text-muted-foreground">{company.roles[0] ?? "Role TBA"}</p>
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
