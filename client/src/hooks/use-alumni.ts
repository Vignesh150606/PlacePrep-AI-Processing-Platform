import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AlumniAnalytics,
  AlumniFilters,
  AlumniManualCreateInput,
  AlumniProfile,
  AlumniProfileSubmission,
  AlumniProfileUpdateInput,
  AlumniStatusUpdateInput,
} from "@placeprep/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";

interface AlumniListResponse {
  items: AlumniProfile[];
  total: number;
  page: number;
  pageSize: number;
}

function buildQuery(filters: AlumniFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.companyId) params.set("company_id", filters.companyId);
  if (filters.department) params.set("department", filters.department);
  if (filters.graduationYear) params.set("graduation_year", String(filters.graduationYear));
  if (filters.domain) params.set("domain", filters.domain);
  if (filters.skill) params.set("skill", filters.skill);
  if (filters.mentorshipAvailable !== undefined) {
    params.set("mentorship_available", String(filters.mentorshipAvailable));
  }
  if (filters.status) params.set("status", filters.status);
  if (filters.sortBy) params.set("sort_by", filters.sortBy);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("page_size", String(filters.pageSize));
  const qs = params.toString();
  return qs ? `/alumni?${qs}` : "/alumni";
}

function invalidateAlumni(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["alumni"] });
  queryClient.invalidateQueries({ queryKey: ["admin", "dashboard-summary"] });
}

/** Alumni Directory listing -- verified-only for non-admins (plus their
 * own profile, whatever its status), admins can additionally pass
 * `status` to work the verification queue. See alumni.py's `list_alumni`. */
export function useAlumni(filters: AlumniFilters = {}) {
  return useQuery({
    queryKey: ["alumni", filters],
    queryFn: () => apiGet<AlumniListResponse>(buildQuery(filters)),
    staleTime: 30_000,
  });
}

export function useAlumniProfile(id: string | undefined) {
  return useQuery({
    queryKey: ["alumni", "detail", id],
    queryFn: () => apiGet<AlumniProfile>(`/alumni/${id}`),
    enabled: !!id,
  });
}

/** Powers both the public Alumni Directory header and the Admin Alumni
 * page's stats section -- see alumni.py's `alumni_analytics` for why it
 * isn't duplicated in two endpoints. */
export function useAlumniAnalytics() {
  return useQuery({
    queryKey: ["alumni", "analytics"],
    queryFn: () => apiGet<AlumniAnalytics>("/alumni/analytics"),
    staleTime: 60_000,
  });
}

/** Returns `null` (not an error) when the signed-in user has no alumni
 * profile yet -- use this to decide "Become an Alumni" vs "Edit my profile". */
export function useMyAlumniProfile() {
  return useQuery({
    queryKey: ["alumni", "me"],
    queryFn: () => apiGet<AlumniProfile | null>("/alumni/me"),
  });
}

/** Self-submission -- always pending-review, never self-promotes. */
export function useSubmitAlumniProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AlumniProfileSubmission) => apiPost<AlumniProfile>("/alumni", input),
    onSuccess: () => {
      invalidateAlumni(queryClient);
      queryClient.invalidateQueries({ queryKey: ["alumni", "me"] });
    },
  });
}

/** Self-edit -- available at any verification status. */
export function useUpdateMyAlumniProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AlumniProfileUpdateInput) => apiPatch<AlumniProfile>("/alumni/me", payload),
    onSuccess: () => {
      invalidateAlumni(queryClient);
      queryClient.invalidateQueries({ queryKey: ["alumni", "me"] });
    },
  });
}

/** Admin Moderation: Edit. */
export function useAdminUpdateAlumni() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alumniId, ...payload }: { alumniId: string } & AlumniProfileUpdateInput) =>
      apiPatch<AlumniProfile>(`/alumni/${alumniId}`, payload),
    onSuccess: () => invalidateAlumni(queryClient),
  });
}

/** Admin Moderation: Approve / Reject / Suspend / Remove Verification. */
export function useUpdateAlumniStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alumniId, ...payload }: { alumniId: string } & AlumniStatusUpdateInput) =>
      apiPatch<AlumniProfile>(`/alumni/${alumniId}/status`, payload),
    onSuccess: () => invalidateAlumni(queryClient),
  });
}

/** Admin "Manual verification" -- creates AND verifies in one step. */
export function useManualCreateAlumni() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AlumniManualCreateInput) => apiPost<AlumniProfile>("/alumni/manual", input),
    onSuccess: () => invalidateAlumni(queryClient),
  });
}

/** Admin Moderation: Delete. */
export function useDeleteAlumni() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alumniId: string) => apiDelete<null>(`/alumni/${alumniId}`),
    onSuccess: () => invalidateAlumni(queryClient),
  });
}
