import { useQuery } from "@tanstack/react-query";
import type { Subject } from "@placeprep/shared";
import { apiGet } from "@/lib/api-client";

interface SubjectListResponse {
  items: Subject[];
}

/** Read-only subject taxonomy list -- see server/app/api/v1/endpoints/subjects.py
 * for why this endpoint exists (it completes a read surface the `subjects`
 * table already had RLS for, but nothing exposed until the Resource
 * Intelligence Hub needed real subject ids for tagging/filtering). */
export function useSubjects() {
  return useQuery({
    queryKey: ["subjects"],
    queryFn: () => apiGet<SubjectListResponse>("/subjects"),
    staleTime: 5 * 60_000,
  });
}
