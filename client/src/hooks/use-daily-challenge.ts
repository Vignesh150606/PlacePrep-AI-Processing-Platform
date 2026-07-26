import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DailyChallenge, DailyChallengeCompleteInput, DailyChallengeStreak } from "@placeprep/shared";
import { apiGet, apiPost } from "@/lib/api-client";

/** Phase 18. `GET /daily-challenge/today` and `GET /daily-challenge/streak`
 * have been real, working backend endpoints since Phase 6 --
 * `FUNCTIONAL_RECOMMENDATIONS.md` flagged this exact gap ("Daily Challenge
 * has no frontend yet") as still open. This is that frontend. */
export function useDailyChallenge() {
  return useQuery({
    queryKey: ["daily-challenge", "today"],
    queryFn: () => apiGet<DailyChallenge>("/daily-challenge/today"),
    staleTime: 60_000,
  });
}

export function useDailyChallengeStreak() {
  return useQuery({
    queryKey: ["daily-challenge", "streak"],
    queryFn: () => apiGet<DailyChallengeStreak>("/daily-challenge/streak"),
    staleTime: 60_000,
  });
}

export function useCompleteDailyChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ progressId, ...payload }: { progressId: string } & DailyChallengeCompleteInput) =>
      apiPost<DailyChallenge>(`/daily-challenge/${progressId}/complete`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-challenge"] });
    },
  });
}
