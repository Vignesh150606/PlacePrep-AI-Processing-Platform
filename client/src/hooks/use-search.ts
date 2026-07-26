import { useQuery } from "@tanstack/react-query";
import type { SearchResponse } from "@placeprep/shared";
import { apiGet } from "@/lib/api-client";

const MIN_QUERY_LENGTH = 2;

/** Phase 18. `GET /search` (question text, company name, PDF file name --
 * see search.py) has existed since Phase 6 with no frontend caller;
 * `command-palette.tsx` instead filtered whatever was already sitting in
 * each of `useQuestions()`/`useCompanies()`/`usePdfs()`'s own React Query
 * cache, which meant results were incomplete for anyone who hadn't already
 * loaded the full question bank into that cache, and missed anything
 * outside those three caches entirely (e.g. bookmarked-but-not-yet-fetched
 * items). This hook is the real thing. */
export function useSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["search", trimmed],
    queryFn: () => apiGet<SearchResponse>(`/search?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 10_000,
  });
}
