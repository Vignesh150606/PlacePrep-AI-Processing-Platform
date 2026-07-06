import * as React from "react";
import type { BookmarkableType } from "@placeprep/shared";

/**
 * In-memory only — no `/api/v1/bookmarks` backend endpoint exists yet (the
 * `bookmarks` table + RLS policies are already there, see
 * supabase/migrations/0002). Building the persistence API is a small new
 * feature, tracked as a Sprint 5 prerequisite in PROJECT_STATE.md, not a
 * bug fix — left out of this pass on purpose.
 *
 * FIX: this used to seed from `mocks/bookmarks.ts`, so every user saw 3
 * bookmarks they never made. That's fake data, not a demo — starts empty
 * now. Bookmarks made during a session are real user actions; they just
 * don't survive a reload until the backend exists.
 */
export function useBookmarks() {
  const [bookmarkedIds, setBookmarkedIds] = React.useState<Set<string>>(() => new Set());

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

  return { isBookmarked, toggle, bookmarkedCount: bookmarkedIds.size };
}
