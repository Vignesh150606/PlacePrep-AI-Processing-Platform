import { useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Handshake,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useAlumni, useAlumniAnalytics, useMyAlumniProfile } from "@/hooks/use-alumni";
import { useCompanies } from "@/hooks/use-companies";
import { AlumniCard } from "@/components/alumni/alumni-card";
import { AlumniFilters, type AlumniFilterState } from "@/components/alumni/alumni-filters";
import { AlumniProfileDialog } from "@/components/alumni/alumni-profile-dialog";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 24;
const CURRENT_YEAR = new Date().getFullYear();
const GRADUATION_YEAR_OPTIONS = Array.from({ length: 16 }, (_, i) => CURRENT_YEAR + 1 - i);

/**
 * Alumni Intelligence Network -- a structured knowledge network connecting
 * students with verified alumni (Phase 11). Deliberately not a social
 * platform: no feed, no messaging, no chat -- just a searchable directory
 * of verified profiles, each one automatically surfacing that alumnus's
 * real contributions (interview experiences, resources) from the EXISTING
 * repositories rather than duplicating any of that data here. Server-side
 * filtering/sorting/pagination, same reasoning resource-library-page.tsx's
 * own docstring gives for the Resource Intelligence Hub.
 */
export function AlumniDirectoryPage() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<AlumniFilterState>({ sortBy: "newest" });
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useAlumni({
    search: search || undefined,
    companyId: filters.companyId,
    department: filters.department,
    graduationYear: filters.graduationYear,
    mentorshipAvailable: filters.mentorshipAvailable,
    status: "verified",
    sortBy: filters.sortBy,
    page,
    pageSize: PAGE_SIZE,
  });
  const { data: companyData } = useCompanies();
  const { data: analytics, isLoading: analyticsLoading } = useAlumniAnalytics();
  const { data: myProfile } = useMyAlumniProfile();

  const alumni = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 1;

  const departmentOptions = useMemo(
    () => (analytics?.departmentCounts ?? []).map((d) => d.department),
    [analytics],
  );

  function updateFilters(next: Partial<AlumniFilterState>) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  const hasAnyFilter =
    !!search || !!filters.companyId || !!filters.department || !!filters.graduationYear || !!filters.mentorshipAvailable;

  const primaryActionLabel = myProfile
    ? myProfile.verificationStatus === "pending-review"
      ? "Edit pending request"
      : "Edit my profile"
    : "Become a verified alumnus";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Alumni Network</h1>
          <p className="text-sm text-muted-foreground">
            A structured knowledge network connecting students with verified alumni -- not a social feed, just
            real profiles, real advice, and real contributions.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <UserPlus className="size-4" /> {primaryActionLabel}
        </Button>
      </div>

      {myProfile?.verificationStatus === "pending-review" && (
        <div className="rounded-lg border border-warning-500/30 bg-warning-500/5 px-4 py-2.5 text-sm text-warning-500">
          Your alumni request is waiting for admin verification. You can keep editing it in the meantime.
        </div>
      )}
      {myProfile?.verificationStatus === "rejected" && (
        <div className="rounded-lg border border-incorrect-500/30 bg-incorrect-500/5 px-4 py-2.5 text-sm text-incorrect-600">
          Your alumni request was rejected{myProfile.rejectionReason ? `: ${myProfile.rejectionReason}` : "."} You
          can update your details and resubmit.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Verified alumni" value={analytics?.verifiedAlumni ?? 0} icon={ShieldCheck} isLoading={analyticsLoading} />
        <StatCard label="Companies represented" value={analytics?.companiesRepresented ?? 0} icon={Building2} isLoading={analyticsLoading} />
        <StatCard label="Departments" value={analytics?.departmentCounts.length ?? 0} icon={GraduationCap} isLoading={analyticsLoading} />
        <StatCard label="Open to mentor" value={analytics?.mentorshipAvailableCount ?? 0} icon={Handshake} isLoading={analyticsLoading} />
        <StatCard label="Total alumni" value={analytics?.totalAlumni ?? 0} icon={Users} isLoading={analyticsLoading} />
      </div>

      <AlumniFilters
        search={search}
        onSearchChange={updateSearch}
        filters={filters}
        onChange={updateFilters}
        companyOptions={companyData?.items ?? []}
        departmentOptions={departmentOptions}
        graduationYearOptions={GRADUATION_YEAR_OPTIONS}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load the alumni directory." onRetry={() => refetch()} />
      ) : alumni.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={hasAnyFilter ? "No alumni match your filters" : "No verified alumni yet"}
          description={
            hasAnyFilter
              ? "Try a different search term or clear a filter."
              : "Once alumni submit profiles and an admin verifies them, they'll appear here."
          }
          action={
            !hasAnyFilter && (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <UserPlus className="size-4" /> Become a verified alumnus
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {alumni.map((a) => (
              <AlumniCard key={a.id} alumni={a} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="size-3.5" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </>
      )}

      <AlumniProfileDialog open={dialogOpen} onOpenChange={setDialogOpen} existing={myProfile} />
    </div>
  );
}
