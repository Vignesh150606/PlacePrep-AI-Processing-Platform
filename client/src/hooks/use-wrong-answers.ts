import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAuth } from "./use-auth";

export interface WrongAnswerEntry {
  questionId: string;
  timesWrong: number;
  lastAttemptAt: string;
  resolved: boolean;
  /** Option ids the student picked on their most recent wrong attempt --
   * empty for entries recorded before this was tracked. */
  lastSelectedOptionIds: string[];
}

interface WrongAnswerListResponse {
  items: WrongAnswerEntry[];
}

export function useWrongAnswers() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["wrong-answers"],
    queryFn: () => apiGet<WrongAnswerListResponse>("/quizzes/wrong-answers"),
    enabled: !!session,
    staleTime: 15_000,
  });
}

export function useSetWrongAnswerResolved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, resolved }: { questionId: string; resolved: boolean }) =>
      apiPost<null>(`/quizzes/wrong-answers/${questionId}/resolved`, { resolved }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wrong-answers"] }),
  });
}
