import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DifficultyLevel,
  Question,
  QuestionAnalytics,
  QuestionBulkActionInput,
  QuestionBulkActionResult,
  QuestionBulkUpdateInput,
  QuestionBulkUpdateResult,
  QuestionLifecycleStatus,
  QuestionSourceType,
} from "@placeprep/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";

interface QuestionListResponse {
  items: Question[];
  total: number;
  page: number;
  pageSize: number;
}

/** Feature 2 -- Question Bank Admin UX. `status: ""` means "any status"
 * (only meaningful for an admin -- the backend still scopes non-admins to
 * `approved` regardless). `deleted: true` is the Deleted tab -- see
 * `list_questions`'s own docstring on why that's mutually exclusive with
 * every other status filter having its usual meaning. */
export interface AdminQuestionFilters {
  status?: QuestionLifecycleStatus | "";
  sourceType?: QuestionSourceType | "";
  difficulty?: DifficultyLevel | "";
  search?: string;
  deleted?: boolean;
  page?: number;
  pageSize?: number;
}

export function useAdminQuestions(filters: AdminQuestionFilters) {
  const { status, sourceType, difficulty, search, deleted, page = 1, pageSize = 25 } = filters;
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  // NOTE: the backend's Query params are snake_case (`source_type`, not
  // `sourceType`) -- FastAPI matches query keys literally, it doesn't
  // camelCase-alias them the way CamelModel does for JSON bodies. An
  // earlier version of this hook sent `sourceType`, which the backend
  // silently ignored (an unrecognized query key, not an error) -- fixed
  // here rather than carried forward into the new admin page.
  if (sourceType) params.set("source_type", sourceType);
  if (difficulty) params.set("difficulty", difficulty);
  if (search) params.set("search", search);
  if (deleted) params.set("deleted", "true");
  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  return useQuery({
    queryKey: ["questions", "admin", status ?? "", sourceType ?? "", difficulty ?? "", search ?? "", !!deleted, page, pageSize],
    queryFn: () => apiGet<QuestionListResponse>(`/questions?${params.toString()}`),
    staleTime: 10_000,
  });
}

export function useQuestionAnalytics() {
  return useQuery({
    queryKey: ["questions", "admin", "analytics"],
    queryFn: () => apiGet<QuestionAnalytics>("/questions/analytics/summary"),
    staleTime: 60_000,
  });
}

function useInvalidateQuestions() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["questions"] });
  };
}

export function useReviewQuestion() {
  const invalidate = useInvalidateQuestions();

  const setStatus = useMutation({
    mutationFn: ({ id, status, rejectionReason }: { id: string; status: "approved" | "rejected"; rejectionReason?: string }) =>
      apiPatch<Question>(`/questions/${id}/status`, { status, rejectionReason }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<Question, "text" | "correctExplanation" | "solutionSteps" | "interviewTip" | "referenceNote" | "difficulty" | "tags">
      >;
    }) => apiPatch<Question>(`/questions/${id}`, patch),
    onSuccess: invalidate,
  });

  /** Phase 15, Part 1 -- this is now a soft delete (recoverable from the
   * Deleted tab via `useRestoreQuestion`), not a real row delete. */
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<null>(`/questions/${id}`),
    onSuccess: invalidate,
  });

  return { setStatus, update, remove };
}

/** Phase 15, Part 1 -- Question Lifecycle Management: single-question
 * archive/unarchive/restore/permanent-delete. Kept separate from
 * `useReviewQuestion` (which predates this phase) rather than folded in,
 * so each hook's mutation list stays legible. */
export function useQuestionLifecycle() {
  const invalidate = useInvalidateQuestions();

  const archive = useMutation({
    mutationFn: (id: string) => apiPatch<Question>(`/questions/${id}/archive`, {}),
    onSuccess: invalidate,
  });
  const unarchive = useMutation({
    mutationFn: (id: string) => apiPatch<Question>(`/questions/${id}/unarchive`, {}),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (id: string) => apiPatch<Question>(`/questions/${id}/restore`, {}),
    onSuccess: invalidate,
  });
  const permanentDelete = useMutation({
    mutationFn: (id: string) => apiDelete<null>(`/questions/${id}/permanent`),
    onSuccess: invalidate,
  });

  return { archive, unarchive, restore, permanentDelete };
}

/** Feature 1's bulk Approve / Reject / Publish / Archive / Unarchive /
 * Restore / Delete / Permanent Delete -- one call, `succeeded`/`failed`
 * ids back, same shape as `useResourceBulkAction`. */
export function useBulkQuestionAction() {
  const invalidate = useInvalidateQuestions();
  return useMutation({
    mutationFn: (input: QuestionBulkActionInput) =>
      apiPost<QuestionBulkActionResult>("/questions/bulk-action", input),
    onSuccess: invalidate,
  });
}

/** Feature 1's bulk Subject / Topic / Company / Difficulty / Tags Update --
 * every field on `QuestionBulkUpdateInput` is independently optional. */
export function useBulkUpdateQuestions() {
  const invalidate = useInvalidateQuestions();
  return useMutation({
    mutationFn: (input: QuestionBulkUpdateInput) =>
      apiPatch<QuestionBulkUpdateResult>("/questions/bulk-update", input),
    onSuccess: invalidate,
  });
}
