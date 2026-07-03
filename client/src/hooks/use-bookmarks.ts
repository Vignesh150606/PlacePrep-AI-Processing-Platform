import * as React from "react";
import type { BookmarkableType } from "@placeprep/shared";
import { mockBookmarks } from "@/mocks/bookmarks";

/**
 * In-memory only for Sprint 1A (mock data layer, no backend). Seeded from
 * mockBookmarks so the UI reflects "already bookmarked" state on load.
 * Swap the internals for a TanStack Query mutation once the bookmarks API
 * exists — the hook's external shape (isBookmarked/toggle) won't need to
 * change at call sites.
 */
export function useBookmarks() {
  const [bookmarkedIds, setBookmarkedIds] = React.useState<Set<string>>(
    () => new Set(mockBookmarks.map((b) => b.targetId)),
  );

  const isBookmarked = React.useCallback(
    (targetId: string) => bookmarkedIds.has(targetId),
    [bookmarkedIds],
  );

  const toggle = React.useCallback((targetId: string, _type: BookmarkableType) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      return next;
    });
  }, []);

  return { isBookmarked, toggle };
}
