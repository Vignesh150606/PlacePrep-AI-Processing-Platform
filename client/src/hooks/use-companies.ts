import { useQuery } from "@tanstack/react-query";
import type { Company } from "@placeprep/shared";
import { apiGet } from "@/lib/api-client";

interface CompanyListResponse {
  items: Company[];
}

/** Real company directory — populated by the classification step, not mocks/companies.ts. */
export function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: () => apiGet<CompanyListResponse>("/companies"),
    staleTime: 60_000,
  });
}

export function useCompany(slug: string | undefined) {
  return useQuery({
    queryKey: ["companies", slug],
    queryFn: () => apiGet<Company>(`/companies/${slug}`),
    enabled: !!slug,
  });
}
