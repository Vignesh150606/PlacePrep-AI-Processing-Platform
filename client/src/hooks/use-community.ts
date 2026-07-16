import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CommunityAnalytics,
  CommunityCategory,
  CommunityComment,
  CommunityPost,
  CommunityPostListResult,
  CommunitySortOption,
  CommunityVoteType,
  ReportedCommunityComment,
  ReportedCommunityPost,
} from "@placeprep/shared";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "@/lib/api-client";

export interface CommunityPostFilters {
  search?: string;
  category?: CommunityCategory;
  companyId?: string;
  tags?: string[];
  authorId?: string;
  sortBy?: CommunitySortOption;
  page?: number;
  pageSize?: number;
}

function buildQuery(filters: CommunityPostFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.category) params.set("category", filters.category);
  if (filters.companyId) params.set("company_id", filters.companyId);
  if (filters.tags?.length) params.set("tags", filters.tags.join(","));
  if (filters.authorId) params.set("author_id", filters.authorId);
  if (filters.sortBy) params.set("sort_by", filters.sortBy);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("page_size", String(filters.pageSize));
  const qs = params.toString();
  return qs ? `/community?${qs}` : "/community";
}

function invalidateCommunity(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["community"] });
  queryClient.invalidateQueries({ queryKey: ["admin", "dashboard-summary"] });
}

/** Every signed-in user sees every post -- see community.py's module
 * docstring for why there's no pending-review gate here. */
export function useCommunityPosts(filters: CommunityPostFilters = {}) {
  return useQuery({
    queryKey: ["community", "posts", filters],
    queryFn: () => apiGet<CommunityPostListResult>(buildQuery(filters)),
    staleTime: 15_000,
  });
}

export function useCommunityPost(postId: string | undefined) {
  return useQuery({
    queryKey: ["community", "posts", "detail", postId],
    queryFn: () => apiGet<CommunityPost>(`/community/${postId}`),
    enabled: !!postId,
  });
}

/** Client-only submission input -- `attachments: File[]` lives here
 * rather than in the shared package for the same reason
 * `ResourceSubmissionInput` keeps `file` client-side (that package is
 * also consumed by the non-browser server). */
export interface CommunityPostSubmissionInput {
  title: string;
  description: string;
  category: CommunityCategory;
  isAnonymous?: boolean;
  companyId?: string;
  companyName?: string;
  tags?: string[];
  attachments?: File[];
}

export function useCreateCommunityPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CommunityPostSubmissionInput) => {
      const formData = new FormData();
      formData.append("title", input.title);
      formData.append("description", input.description);
      formData.append("category", input.category);
      formData.append("is_anonymous", String(!!input.isAnonymous));
      if (input.companyId) formData.append("company_id", input.companyId);
      if (input.companyName) formData.append("company_name", input.companyName);
      if (input.tags?.length) formData.append("tags", input.tags.join(","));
      for (const file of input.attachments ?? []) {
        formData.append("files", file);
      }
      return apiUpload<CommunityPost>("/community", formData);
    },
    onSuccess: () => invalidateCommunity(queryClient),
  });
}

export interface CommunityPostUpdateInput {
  title?: string;
  description?: string;
  category?: CommunityCategory;
  companyId?: string | null;
  companyName?: string | null;
  tags?: string[];
}

export function useUpdateCommunityPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, ...payload }: { postId: string } & CommunityPostUpdateInput) =>
      apiPatch<CommunityPost>(`/community/${postId}`, payload),
    onSuccess: () => invalidateCommunity(queryClient),
  });
}

/** Admin-only pin/lock -- separate from `useUpdateCommunityPost` because
 * these are moderation toggles, not content edits (see community.py's
 * `moderate_post`). */
export function useModerateCommunityPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, ...payload }: { postId: string; isPinned?: boolean; isLocked?: boolean }) =>
      apiPatch<CommunityPost>(`/community/${postId}/moderate`, payload),
    onSuccess: () => invalidateCommunity(queryClient),
  });
}

export function useDeleteCommunityPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => apiDelete<null>(`/community/${postId}`),
    onSuccess: () => invalidateCommunity(queryClient),
  });
}

export function useVoteCommunityPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, voteType }: { postId: string; voteType: CommunityVoteType }) =>
      apiPost<{ helpful: number; notHelpful: number }>(`/community/${postId}/vote`, { voteType }),
    onSuccess: () => invalidateCommunity(queryClient),
  });
}

export function useReportCommunityPost() {
  return useMutation({
    mutationFn: ({ postId, reason }: { postId: string; reason: string }) =>
      apiPost<null>(`/community/${postId}/report`, { reason }),
  });
}

export function useDownloadCommunityAttachment() {
  return useMutation({
    mutationFn: ({ postId, index }: { postId: string; index: number }) =>
      apiGet<{ downloadUrl: string; fileName: string }>(`/community/${postId}/attachments/${index}/download`),
  });
}

export function useCommunityComments(postId: string | undefined) {
  return useQuery({
    queryKey: ["community", "posts", postId, "comments"],
    queryFn: () => apiGet<{ items: CommunityComment[] }>(`/community/${postId}/comments`),
    enabled: !!postId,
  });
}

export function useCreateCommunityComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      postId,
      ...payload
    }: {
      postId: string;
      content: string;
      parentCommentId?: string;
      isAnonymous?: boolean;
    }) => apiPost<CommunityComment>(`/community/${postId}/comments`, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["community", "posts", variables.postId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["community", "posts", "detail", variables.postId] });
      queryClient.invalidateQueries({ queryKey: ["community", "posts"] });
    },
  });
}

export function useUpdateCommunityComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      apiPatch<CommunityComment>(`/community/comments/${commentId}`, { content }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["community"] }),
  });
}

export function useDeleteCommunityComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => apiDelete<null>(`/community/comments/${commentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["community"] }),
  });
}

export function useVoteCommunityComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, voteType }: { commentId: string; voteType: CommunityVoteType }) =>
      apiPost<{ helpful: number }>(`/community/comments/${commentId}/vote`, { voteType }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["community"] }),
  });
}

export function useReportCommunityComment() {
  return useMutation({
    mutationFn: ({ commentId, reason }: { commentId: string; reason: string }) =>
      apiPost<null>(`/community/comments/${commentId}/report`, { reason }),
  });
}

/** Open to any signed-in user, same reasoning as `useAlumniAnalytics` --
 * powers both a Community header and the Admin Community page. */
export function useCommunityAnalytics() {
  return useQuery({
    queryKey: ["community", "analytics"],
    queryFn: () => apiGet<CommunityAnalytics>("/community/meta/analytics"),
    staleTime: 60_000,
  });
}

// --- Admin moderation queue --------------------------------------------

export function useReportedCommunityPosts() {
  return useQuery({
    queryKey: ["community", "admin", "reported-posts"],
    queryFn: () => apiGet<ReportedCommunityPost[]>("/community/admin/reported-posts"),
  });
}

export function useReportedCommunityComments() {
  return useQuery({
    queryKey: ["community", "admin", "reported-comments"],
    queryFn: () => apiGet<ReportedCommunityComment[]>("/community/admin/reported-comments"),
  });
}

export function useDismissPostReports() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => apiDelete<null>(`/community/admin/reported-posts/${postId}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["community"] }),
  });
}

export function useDismissCommentReports() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => apiDelete<null>(`/community/admin/reported-comments/${commentId}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["community"] }),
  });
}

export function useSuspendCommunityUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      apiPost<null>(`/community/admin/users/${userId}/suspend`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["community"] }),
  });
}

export function useUnsuspendCommunityUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<null>(`/community/admin/users/${userId}/unsuspend`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["community"] }),
  });
}
