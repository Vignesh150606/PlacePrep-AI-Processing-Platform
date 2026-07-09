import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuizAttempt, QuizAttemptStartInput, QuizAttemptSubmitInput } from "@placeprep/shared";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { useAuth } from "./use-auth";

interface QuizAttemptListResponse {
  items: QuizAttempt[];
}

export function useQuizAttempts() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["quiz-attempts"],
    queryFn: () => apiGet<QuizAttemptListResponse>("/quizzes/attempts"),
    enabled: !!session,
    staleTime: 15_000,
  });
}

/** The most recent still-"in-progress" attempt, if any — powers "Resume interrupted quiz". */
export function useInProgressAttempt() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["quiz-attempts", "in-progress"],
    queryFn: () => apiGet<QuizAttempt | null>("/quizzes/attempts/in-progress"),
    enabled: !!session,
  });
}

export function useStartQuizAttempt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuizAttemptStartInput) => apiPost<QuizAttempt>("/quizzes/attempts", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-attempts"] });
    },
  });
}

export function useSubmitQuizAttempt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuizAttemptSubmitInput) =>
      apiPost<QuizAttempt>(`/quizzes/attempts/${input.attemptId}/submit`, {
        responses: input.responses,
        timeTakenSeconds: input.timeTakenSeconds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-attempts"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      queryClient.invalidateQueries({ queryKey: ["wrong-answers"] });
    },
  });
}

export function useAbandonQuizAttempt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: string) => apiDelete<null>(`/quizzes/attempts/${attemptId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quiz-attempts"] }),
  });
}
