import { useState } from "react";
import { ChevronLeft, ChevronRight, MessagesSquare, Plus } from "lucide-react";
import { useCommunityPosts } from "@/hooks/use-community";
import { useCompanies } from "@/hooks/use-companies";
import { CommunityPostCard } from "@/components/community/community-post-card";
import { CommunityPostFilters, type CommunityFilterState } from "@/components/community/community-post-filters";
import { CommunityPostComposerDialog } from "@/components/community/community-post-composer-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 20;

/**
 * Placement Community (Phase 12) -- a professional discussion forum for
 * placement preparation, not a social feed. Filtering/sorting/pagination
 * all happen server-side (see community.py's `list_posts`), same division
 * of labor `ResourceLibraryPage` established for the Resource Intelligence
 * Hub. Posts are visible to everyone immediately (see community.py's
 * module docstring for why there's no pending-review gate here).
 */
export function CommunityPage() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CommunityFilterState>({ sortBy: "newest" });
  const [page, setPage] = useState(1);
  const [composerOpen, setComposerOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useCommunityPosts({
    search: search || undefined,
    category: filters.category,
    companyId: filters.companyId,
    sortBy: filters.sortBy,
    page,
    pageSize: PAGE_SIZE,
  });
  const { data: companyData } = useCompanies();

  const posts = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 1;
  const hasAnyFilter = !!search || !!filters.category || !!filters.companyId;

  function updateFilters(next: Partial<CommunityFilterState>) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Placement Community</h1>
          <p className="text-sm text-muted-foreground">
            Ask doubts, discuss OAs and companies, and share preparation strategies with students and verified
            alumni.
          </p>
        </div>
        <Button size="sm" onClick={() => setComposerOpen(true)}>
          <Plus className="size-4" /> Start a discussion
        </Button>
      </div>

      <CommunityPostFilters
        search={search}
        onSearchChange={updateSearch}
        filters={filters}
        onChange={updateFilters}
        companyOptions={companyData?.items ?? []}
      />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load the Community." onRetry={() => refetch()} />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={hasAnyFilter ? "No discussions match your filters" : "No discussions yet"}
          description={
            hasAnyFilter
              ? "Try a different search term or clear a filter."
              : "Be the first to ask a doubt, share an OA experience, or start a preparation discussion."
          }
          action={
            !hasAnyFilter && (
              <Button size="sm" onClick={() => setComposerOpen(true)}>
                <Plus className="size-4" /> Start a discussion
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <CommunityPostCard key={post.id} post={post} />
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
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </>
      )}

      <CommunityPostComposerDialog open={composerOpen} onOpenChange={setComposerOpen} />
    </div>
  );
}
