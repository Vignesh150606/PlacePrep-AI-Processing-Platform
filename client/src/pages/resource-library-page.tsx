import { useState } from "react";
import { ChevronLeft, ChevronRight, Library, Plus } from "lucide-react";
import { useResources } from "@/hooks/use-resources";
import { useSubjects } from "@/hooks/use-subjects";
import { useTopics } from "@/hooks/use-topics";
import { useCompanies } from "@/hooks/use-companies";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { ResourceCard } from "@/components/resources/resource-card";
import { ResourceFilters, type ResourceFilterState } from "@/components/resources/resource-filters";
import { ResourceSubmissionDialog } from "@/components/resources/resource-submission-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 24;

/**
 * Resource Intelligence Hub -- the central knowledge repository for
 * placement preparation (Phase 10). Filtering/sorting/pagination all
 * happen server-side (see resources.py's list_resources) rather than the
 * client-side-filter-a-full-list pattern Question Bank uses -- the
 * taxonomy here is wide enough (13 categories x subject x topic x company
 * x difficulty x tags) that fetching everything up front wouldn't scale
 * the way it does for a few hundred questions.
 */
export function ResourceLibraryPage() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ResourceFilterState>({ tags: [], sortBy: "newest" });
  const [page, setPage] = useState(1);
  const [submitOpen, setSubmitOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useResources({
    search: search || undefined,
    category: filters.category,
    difficulty: filters.difficulty,
    subjectId: filters.subjectId,
    topicId: filters.topicId,
    companyId: filters.companyId,
    tags: filters.tags,
    sortBy: filters.sortBy,
    page,
    pageSize: PAGE_SIZE,
  });
  const { data: subjectData } = useSubjects();
  const { data: topicData } = useTopics(filters.subjectId);
  const { data: companyData } = useCompanies();
  const { isBookmarked, toggle } = useBookmarks();

  const resources = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 1;

  function updateFilters(next: Partial<ResourceFilterState>) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  const hasAnyFilter =
    !!search ||
    !!filters.category ||
    !!filters.difficulty ||
    !!filters.subjectId ||
    !!filters.topicId ||
    !!filters.companyId ||
    filters.tags.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Resource Library</h1>
          <p className="text-sm text-muted-foreground">
            Cheat sheets, formula sheets, roadmaps, previous papers, videos, and more — reviewed by admins
            before publishing.
          </p>
        </div>
        <Button size="sm" onClick={() => setSubmitOpen(true)}>
          <Plus className="size-4" /> Submit a resource
        </Button>
      </div>

      <ResourceFilters
        search={search}
        onSearchChange={updateSearch}
        filters={filters}
        onChange={updateFilters}
        subjectOptions={subjectData?.items ?? []}
        topicOptions={topicData?.items ?? []}
        companyOptions={companyData?.items ?? []}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load the resource library." onRetry={() => refetch()} />
      ) : resources.length === 0 ? (
        <EmptyState
          icon={Library}
          title={hasAnyFilter ? "No resources match your filters" : "No resources yet"}
          description={
            hasAnyFilter
              ? "Try a different search term or clear a filter."
              : "Be the first to share a cheat sheet, roadmap, or previous paper — it'll appear here once an admin approves it."
          }
          action={
            !hasAnyFilter && (
              <Button size="sm" onClick={() => setSubmitOpen(true)}>
                <Plus className="size-4" /> Submit a resource
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                isBookmarked={isBookmarked(resource.id)}
                onToggleBookmark={(id) => toggle(id, "resource")}
              />
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

      <ResourceSubmissionDialog open={submitOpen} onOpenChange={setSubmitOpen} />
    </div>
  );
}
