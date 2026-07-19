import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Resource,
  ResourceAnalytics,
  ResourceBulkActionInput,
  ResourceBulkActionResult,
  ResourceBulkUpdateInput,
  ResourceBulkUpdateResult,
  ResourceDownload,
  ResourceFilters,
  ResourceStatusUpdateInput,
  ResourceUpdateInput,
} from "@placeprep/shared";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "@/lib/api-client";

interface ResourceListResponse {
  items: Resource[];
  total: number;
  page: number;
  pageSize: number;
}

function buildQuery(filters: ResourceFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.category) params.set("category", filters.category);
  if (filters.companyId) params.set("company_id", filters.companyId);
  if (filters.subjectId) params.set("subject_id", filters.subjectId);
  if (filters.topicId) params.set("topic_id", filters.topicId);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.tags?.length) params.set("tags", filters.tags.join(","));
  if (filters.status) params.set("status", filters.status);
  if (filters.sortBy) params.set("sort_by", filters.sortBy);
  // Phase 15, Part 2 -- admin-only Deleted tab; see `list_resources`'s own
  // docstring on why this is mutually exclusive with every other tab.
  if (filters.deleted) params.set("deleted", "true");
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("page_size", String(filters.pageSize));
  const qs = params.toString();
  return qs ? `/resources?${qs}` : "/resources";
}

function invalidateResources(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["resources"] });
  queryClient.invalidateQueries({ queryKey: ["admin", "dashboard-summary"] });
}

export function useResources(filters: ResourceFilters = {}) {
  return useQuery({
    queryKey: ["resources", filters],
    queryFn: () => apiGet<ResourceListResponse>(buildQuery(filters)),
    staleTime: 30_000,
  });
}

export function useResource(id: string | undefined) {
  return useQuery({
    queryKey: ["resources", "detail", id],
    queryFn: () => apiGet<Resource>(`/resources/${id}`),
    enabled: !!id,
  });
}

/** Client-only submission input -- see shared/src/types/resource.ts's
 * `ResourceSubmission` docstring for why `file` lives here instead of in
 * the shared package (that package is also consumed by the non-browser
 * server and deliberately never references DOM types like `File`). */
export interface ResourceSubmissionInput {
  title: string;
  description?: string;
  category: string;
  subjectId?: string;
  topicId?: string;
  companyId?: string;
  difficulty?: string;
  tags?: string[];
  author?: string;
  externalUrl?: string;
  file?: File;
}

export function useSubmitResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ResourceSubmissionInput) => {
      const formData = new FormData();
      formData.append("title", input.title);
      if (input.description) formData.append("description", input.description);
      formData.append("category", input.category);
      if (input.subjectId) formData.append("subject_id", input.subjectId);
      if (input.topicId) formData.append("topic_id", input.topicId);
      if (input.companyId) formData.append("company_id", input.companyId);
      if (input.difficulty) formData.append("difficulty", input.difficulty);
      if (input.tags?.length) formData.append("tags", input.tags.join(","));
      if (input.author) formData.append("author", input.author);
      if (input.externalUrl) formData.append("external_url", input.externalUrl);
      if (input.file) formData.append("file", input.file);
      return apiUpload<Resource>("/resources", formData);
    },
    onSuccess: () => invalidateResources(queryClient),
  });
}

/** Admin Moderation: Approve / Reject. */
export function useUpdateResourceStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, ...payload }: { resourceId: string } & ResourceStatusUpdateInput) =>
      apiPatch<Resource>(`/resources/${resourceId}/status`, payload),
    onSuccess: () => invalidateResources(queryClient),
  });
}

/** Admin Moderation: Edit. */
export function useUpdateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, ...payload }: { resourceId: string } & ResourceUpdateInput) =>
      apiPatch<Resource>(`/resources/${resourceId}`, payload),
    onSuccess: () => invalidateResources(queryClient),
  });
}

/** Admin Moderation: Delete. Phase 15, Part 2 -- this is now a soft delete
 * (recoverable from the Deleted tab via `useResourceLifecycle().restore`),
 * not a real row delete -- same change Part 1 already made to
 * `useReviewQuestion`'s `remove`. */
export function useDeleteResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resourceId: string) => apiDelete<null>(`/resources/${resourceId}`),
    onSuccess: () => invalidateResources(queryClient),
  });
}

/** Phase 15, Part 2 (Slice A) -- Resource Lifecycle Management: single-
 * resource archive/unarchive/restore/permanent-delete. Kept separate from
 * `useDeleteResource`/`useUpdateResourceStatus` (which predate this phase)
 * rather than folded in, same reasoning as `useQuestionLifecycle`. */
export function useResourceLifecycle() {
  const queryClient = useQueryClient();
  const invalidate = () => invalidateResources(queryClient);

  const archive = useMutation({
    mutationFn: (resourceId: string) => apiPatch<Resource>(`/resources/${resourceId}/archive`, {}),
    onSuccess: invalidate,
  });
  const unarchive = useMutation({
    mutationFn: (resourceId: string) => apiPatch<Resource>(`/resources/${resourceId}/unarchive`, {}),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (resourceId: string) => apiPatch<Resource>(`/resources/${resourceId}/restore`, {}),
    onSuccess: invalidate,
  });
  const permanentDelete = useMutation({
    mutationFn: (resourceId: string) => apiDelete<null>(`/resources/${resourceId}/permanent`),
    onSuccess: invalidate,
  });

  return { archive, unarchive, restore, permanentDelete };
}

/** Admin Moderation: Bulk Actions (approve/reject/delete/archive/unarchive/
 * restore/permanent-delete many at once) -- extended in Phase 15, Part 2
 * with the lifecycle actions, same shape as `useBulkQuestionAction`. */
export function useBulkResourceAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResourceBulkActionInput) =>
      apiPost<ResourceBulkActionResult>("/resources/bulk-action", input),
    onSuccess: () => invalidateResources(queryClient),
  });
}

/** Feature 1's bulk Category Update / Tags Update -- both fields on
 * `ResourceBulkUpdateInput` are independently optional, same shape as
 * `useBulkUpdateQuestions`. */
export function useBulkUpdateResources() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResourceBulkUpdateInput) =>
      apiPatch<ResourceBulkUpdateResult>("/resources/bulk-update", input),
    onSuccess: () => invalidateResources(queryClient),
  });
}

/** Feature 6 (Analytics), scoped to resources. */
export function useResourceAnalytics() {
  return useQuery({
    queryKey: ["resources", "admin", "analytics"],
    queryFn: () => apiGet<ResourceAnalytics>("/resources/analytics/summary"),
    staleTime: 60_000,
  });
}

/** Opens/downloads a resource and increments its real download count --
 * see resources.py's `download_resource` for why this is a dedicated
 * endpoint rather than a raw storage link (the bucket is private, so a
 * signed URL has to be minted server-side, and the count needs to move
 * atomically either way). */
export function useDownloadResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resourceId: string) => apiPost<ResourceDownload>(`/resources/${resourceId}/download`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}
