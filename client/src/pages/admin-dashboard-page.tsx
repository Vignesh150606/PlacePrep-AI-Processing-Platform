import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  FileStack,
  Flag,
  GraduationCap,
  Library,
  MessagesSquare,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { UserRole } from "@placeprep/shared";
import { useAdminDashboardSummary, useAdminUsers, useUpdateUserRole, type AdminUser } from "@/hooks/use-admin";
import { useProfile } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/search-bar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 20;
const ROLES: UserRole[] = ["student", "alumni", "admin"];
const ROLE_BADGE_VARIANT: Record<UserRole, "neutral" | "accent" | "warning"> = {
  student: "neutral",
  alumni: "accent",
  admin: "warning",
};

// Matches the getInitials() helper in profile-menu.tsx -- duplicated locally
// rather than extracted, since that's the existing convention in this
// codebase (profile-menu.tsx doesn't export it either).
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function SummaryCards() {
  const { data, isLoading, isError, refetch } = useAdminDashboardSummary();

  if (isError) {
    return <ErrorState description="We couldn't load the dashboard summary." onRetry={() => refetch()} />;
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      <Link to="/pdfs">
        <StatCard
          label="Pending PDF approvals"
          value={data?.pendingPdfApprovals ?? 0}
          icon={FileStack}
          isLoading={isLoading}
        />
      </Link>
      <Link to="/admin/review">
        <StatCard
          label="Pending question reviews"
          value={data?.pendingQuestionReviews ?? 0}
          icon={ShieldCheck}
          isLoading={isLoading}
        />
      </Link>
      <Link to="/admin/review">
        <StatCard
          label="Archived questions"
          value={data?.archivedQuestionCount ?? 0}
          icon={Archive}
          isLoading={isLoading}
        />
      </Link>
      <Link to="/admin/review">
        <StatCard
          label="Deleted questions"
          value={data?.deletedQuestionCount ?? 0}
          icon={Trash2}
          isLoading={isLoading}
        />
      </Link>
      <Link to="/experiences">
        <StatCard
          label="Pending interview reviews"
          value={data?.pendingInterviewReviews ?? 0}
          icon={MessagesSquare}
          isLoading={isLoading}
        />
      </Link>
      <Link to="/experiences">
        <StatCard
          label="Reported experiences"
          value={data?.reportedExperienceCount ?? 0}
          icon={Flag}
          isLoading={isLoading}
        />
      </Link>
      <Link to="/admin/resources">
        <StatCard
          label="Pending resource reviews"
          value={data?.pendingResourceReviews ?? 0}
          icon={Library}
          isLoading={isLoading}
        />
      </Link>
      <Link to="/admin/alumni">
        <StatCard
          label="Pending alumni verifications"
          value={data?.pendingAlumniVerifications ?? 0}
          icon={GraduationCap}
          isLoading={isLoading}
        />
      </Link>
      <Link to="/admin/community">
        <StatCard
          label="Reported community content"
          value={data?.reportedCommunityContentCount ?? 0}
          icon={Flag}
          isLoading={isLoading}
        />
      </Link>
      <Link to="/pdfs">
        <StatCard
          label="Failed processing jobs"
          value={data?.failedProcessingJobs ?? 0}
          icon={XCircle}
          isLoading={isLoading}
        />
      </Link>
      <StatCard label="Total users" value={data?.totalUsers ?? 0} icon={Users} isLoading={isLoading} />
      <StatCard label="Admins" value={data?.totalAdmins ?? 0} icon={ShieldCheck} isLoading={isLoading} />
    </div>
  );
}

function RoleMenu({ user, disabled }: { user: AdminUser; disabled: boolean }) {
  const updateRole = useUpdateUserRole();

  function handleSelect(role: UserRole) {
    if (role === user.role) return;
    const confirmed = window.confirm(`Change ${user.fullName}'s role from ${user.role} to ${role}?`);
    if (!confirmed) return;
    updateRole.mutate(
      { userId: user.id, role },
      {
        onSuccess: () => toast.success(`${user.fullName} is now ${role}.`),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't update role."),
      },
    );
  }

  if (disabled) {
    return <span className="text-xs text-muted-foreground">That's you</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={updateRole.isPending}>
          Change role
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ROLES.map((role) => (
          <DropdownMenuItem key={role} disabled={role === user.role} onSelect={() => handleSelect(role)}>
            <span className="capitalize">Make {role}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UsersTable() {
  const { data: myProfile } = useProfile();
  const [page, setPage] = React.useState(1);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<UserRole | undefined>(undefined);

  // Debounce the search box so we're not firing a request per keystroke --
  // no shared debounce hook exists in this codebase yet, so this stays
  // local rather than introducing a new generic utility for one caller.
  React.useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { data, isLoading, isError, refetch } = useAdminUsers({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    role: roleFilter,
  });

  const users = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchBar
            placeholder="Search by name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            containerClassName="sm:max-w-xs"
          />
          <select
            value={roleFilter ?? ""}
            onChange={(e) => {
              setRoleFilter((e.target.value || undefined) as UserRole | undefined);
              setPage(1);
            }}
            className="h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role} className="capitalize">
                {role}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState description="We couldn't load the user list." onRetry={() => refetch()} />
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="No users match" description="Try a different search term or role filter." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>College</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar>
                          <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
                          <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">{user.fullName}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_BADGE_VARIANT[user.role]} className="capitalize">
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.college || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                    <TableCell>
                      <RoleMenu user={user} disabled={user.id === myProfile?.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

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
      </CardContent>
    </Card>
  );
}

/**
 * Admin Portal Expansion, Module 1 -- Dashboard + Users & Roles. The first
 * consolidated admin landing page; previously the only admin-specific route
 * was /admin/review, with everything else scattered across admin-only tabs
 * on otherwise-shared pages. See PROJECT_STATE.md for the full audit this
 * module came out of and what's intentionally deferred (audit trail is now
 * live; storage/AI usage and persisted error logs remain deferred). Community
 * moderation now lives at /admin/community (Phase 12).
 */
export function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Everything waiting on you, plus user &amp; role management.
          </p>
        </div>
        <Link to="/admin/audit-log">
          <Button variant="outline" size="sm">
            View audit log
          </Button>
        </Link>
      </div>
      <SummaryCards />
      <UsersTable />
    </div>
  );
}
