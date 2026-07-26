import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Company,
  CompanyBulkActionInput,
  CompanyBulkActionResult,
  CompanyCreateInput,
  CompanyMergeInput,
  CompanyMergeResult,
  CompanyUpdateInput,
} from "@placeprep/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";

interface CompanyListResponse {
  items: Company[];
}

function invalidateCompanies(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["companies"] });
  queryClient.invalidateQueries({ queryKey: ["admin", "dashboard-summary"] });
}

/** Real company directory -- populated by the classification step, not mocks/companies.ts.
 * Students only ever get `status: "active"` rows back (server-enforced,
 * see companies.py's `list_companies`), so no client-side filtering is
 * needed here for the everyday case. */
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

/** Phase 18 -- Admin Company Management. `status`/`deleted` mirror
 * `ResourceFilters`' admin-tab shape: `deleted: true` is mutually
 * exclusive with everything else (the Deleted tab), `status` filters
 * Active vs Archived otherwise. Non-admins get a 403 from the backend if
 * they somehow call this -- this hook is only ever mounted from
 * `AdminCompaniesPage`, which is itself route-gated. */
export function useAdminCompanies(params: { status?: "active" | "archived"; deleted?: boolean } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.deleted) query.set("deleted", "true");
  const qs = query.toString();
  return useQuery({
    queryKey: ["companies", "admin", params],
    queryFn: () => apiGet<CompanyListResponse>(qs ? `/companies?${qs}` : "/companies"),
    staleTime: 15_000,
  });
}

/** Admin-only create -- used by the Admin Companies page's own "New
 * Company" action AND by `CompanyCombobox`'s inline "+ Create" quick-add
 * (see that component for why the combobox needs its own lightweight
 * create path rather than sending the admin away to a whole other page). */
export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyCreateInput) => apiPost<Company>("/companies", input),
    onSuccess: () => invalidateCompanies(queryClient),
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, ...payload }: { companyId: string } & CompanyUpdateInput) =>
      apiPatch<Company>(`/companies/${companyId}`, payload),
    onSuccess: () => invalidateCompanies(queryClient),
  });
}

/** Single-company archive/unarchive/restore/permanent-delete -- same
 * shape as `useResourceLifecycle()`/`useQuestionLifecycle()`. */
export function useCompanyLifecycle() {
  const queryClient = useQueryClient();
  const invalidate = () => invalidateCompanies(queryClient);

  const archive = useMutation({
    mutationFn: (companyId: string) => apiPatch<Company>(`/companies/${companyId}/archive`, {}),
    onSuccess: invalidate,
  });
  const unarchive = useMutation({
    mutationFn: (companyId: string) => apiPatch<Company>(`/companies/${companyId}/unarchive`, {}),
    onSuccess: invalidate,
  });
  const softDelete = useMutation({
    mutationFn: (companyId: string) => apiDelete<null>(`/companies/${companyId}`),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (companyId: string) => apiPatch<Company>(`/companies/${companyId}/restore`, {}),
    onSuccess: invalidate,
  });
  const permanentDelete = useMutation({
    mutationFn: (companyId: string) => apiDelete<null>(`/companies/${companyId}/permanent`),
    onSuccess: invalidate,
  });

  return { archive, unarchive, softDelete, restore, permanentDelete };
}

/** Bulk Archive / Unarchive / Delete / Restore / Permanent Delete -- same
 * shape as `useBulkResourceAction`. */
export function useBulkCompanyAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyBulkActionInput) => apiPost<CompanyBulkActionResult>("/companies/bulk-action", input),
    onSuccess: () => invalidateCompanies(queryClient),
  });
}

/** Merge `duplicateId` into `canonicalId` -- see `company_merge.py` for
 * what actually moves. */
export function useMergeCompanies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ canonicalId, ...payload }: { canonicalId: string } & CompanyMergeInput) =>
      apiPost<CompanyMergeResult>(`/companies/${canonicalId}/merge`, payload),
    onSuccess: () => invalidateCompanies(queryClient),
  });
}
