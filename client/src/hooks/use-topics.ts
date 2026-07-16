import { useQuery } from "@tanstack/react-query";
import type { Topic } from "@placeprep/shared";
import { apiGet } from "@/lib/api-client";

interface TopicListResponse {
  items: Topic[];
}

/** Read-only topic taxonomy list, optionally narrowed to one subject --
 * same reasoning as use-subjects.ts. */
export function useTopics(subjectId?: string) {
  return useQuery({
    queryKey: ["topics", subjectId ?? "all"],
    queryFn: () => {
      const params = subjectId ? `?subject_id=${encodeURIComponent(subjectId)}` : "";
      return apiGet<TopicListResponse>(`/topics${params}`);
    },
    staleTime: 5 * 60_000,
  });
}
