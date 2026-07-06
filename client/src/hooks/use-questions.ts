import { useQuery } from "@tanstack/react-query";
import type { Question } from "@placeprep/shared";
import { apiGet } from "@/lib/api-client";

interface QuestionListResponse {
  items: Question[];
  total: number;
}

/** Real Question Bank data — the pipeline's actual output, not mocks/questions.ts. */
export function useQuestions() {
  return useQuery({
    queryKey: ["questions"],
    queryFn: () => apiGet<QuestionListResponse>("/questions"),
    staleTime: 30_000,
  });
}
