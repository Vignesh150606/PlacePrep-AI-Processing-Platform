import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Bookmark, BookmarkableType } from "@placeprep/shared";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { useAuth } from "./use-auth";

interface BookmarkListResponse {
  items: Bookmark[];
}

export function useBookmarksList() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["bookmarks"],
    queryFn: () => apiGet<BookmarkListResponse>("/bookmarks"),
    enabled: !!session,
    staleTime: 30_000,
  });
}

/**
 * Same public shape (`isBookmarked`, `toggle`, `bookmarkedCount`) the old
 * in-memory hook exposed, so every existing call site (QuestionCard,
 * Question Bank, Company Detail, Dashboard) keeps working unmodified —
 * only the persistence underneath changed.
 */
export function useBookmarks() {
  const { data, isLoading } = useBookmarksList();
  const queryClient = useQueryClient();
  const bookmarks = data?.items ?? [];

  const isBookmarked = (targetId: string) => bookmarks.some((b) => b.targetId === targetId);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] });

  const addMutation = useMutation({
    mutationFn: ({ targetId, type }: { targetId: string; type: BookmarkableType }) =>
      apiPost<Bookmark>("/bookmarks", { targetType: type, targetId }),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: ({ targetId, type }: { targetId: string; type: BookmarkableType }) =>
      apiDelete<null>(`/bookmarks/${type}/${targetId}`),
    onSuccess: invalidate,
  });

  function toggle(targetId: string, type: BookmarkableType) {
    if (isBookmarked(targetId)) {
      removeMutation.mutate({ targetId, type });
    } else {
      addMutation.mutate({ targetId, type });
    }
  }

  return {
    bookmarks,
    isBookmarked,
    toggle,
    bookmarkedCount: bookmarks.length,
    isLoading,
  };
}
