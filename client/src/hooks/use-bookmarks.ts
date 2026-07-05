import * as React from "react";
import type { BookmarkableType } from "@placeprep/shared";
import { mockBookmarks } from "@/mocks/bookmarks";

/**
 * In-memory only, same as before this polish pass. NOTE: a real `bookmarks`
 * table + RLS policies already exist (see supabase/migrations/0002), but
 * there is no `/api/v1/bookmarks` backend endpoint yet — wiring one up is a
 * new feature (a small one, but still), so it's intentionally left out of
 * this polish/bug-fix pass rather than added silently. Tracked as the
 * natural next step in PROJECT_STATE.md.
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
