import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Question } from "@placeprep/shared";
import { apiDelete, apiGet, apiPatch } from "@/lib/api-client";

interface QuestionListResponse {
  items: Question[];
  total: number;
}

export function usePendingReviewQuestions(sourceType?: string) {
  return useQuery({
    queryKey: ["questions", "pending-review", sourceType ?? "all"],
    queryFn: () =>
      apiGet<QuestionListResponse>(
        `/questions?status=pending-review${sourceType ? `&sourceType=${sourceType}` : ""}`,
      ),
    staleTime: 10_000,
  });
}

export function useReviewQuestion() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["questions"] });
  };

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

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<null>(`/questions/${id}`),
    onSuccess: invalidate,
  });

  return { setStatus, update, remove };
}
