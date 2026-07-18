import { Skeleton } from "@/components/ui/skeleton";

// NEW (Phase 14, Part 1 -- Performance). Fallback for the single
// `<Suspense>` boundary around `<Outlet />` in AppLayout, covering every
// lazy-loaded route from router.tsx. Deliberately generic (not
// page-specific) since it only shows for the brief window while a route
// chunk downloads -- usually imperceptible on a warm cache, and on a cold
// one this reads as "loading" rather than a blank frame.
export function RouteLoadingFallback() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
