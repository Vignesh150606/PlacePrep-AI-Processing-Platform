import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Profile, UserRole } from "@placeprep/shared";
import { apiGet, apiPatch } from "@/lib/api-client";

export interface AdminDashboardSummary {
  pendingPdfApprovals: number;
  pendingQuestionReviews: number;
  pendingInterviewReviews: number;
  reportedExperienceCount: number;
  failedProcessingJobs: number;
  totalUsers: number;
  totalAdmins: number;
}

/** Admin user rows only ever need a slice of `Profile` -- there's no
 * `Profile.id`-shaped write path here beyond the role, so the backend
 * returns the same field set rather than the full profile-completion
 * bookkeeping `/profiles/me` computes for the signed-in user's own page. */
export type AdminUser = Omit<Profile, "profileCompletion" | "updatedAt">;

interface AdminUserListResponse {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

export function useAdminDashboardSummary() {
  return useQuery({
    queryKey: ["admin", "dashboard-summary"],
    queryFn: () => apiGet<AdminDashboardSummary>("/admin/dashboard-summary"),
    staleTime: 30_000,
  });
}

export function useAdminUsers(params: { page: number; pageSize: number; search?: string; role?: UserRole }) {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("page_size", String(params.pageSize));
  if (params.search) query.set("search", params.search);
  if (params.role) query.set("role", params.role);

  return useQuery({
    queryKey: ["admin", "users", params],
    queryFn: () => apiGet<AdminUserListResponse>(`/admin/users?${query.toString()}`),
    staleTime: 10_000,
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) =>
      apiPatch<AdminUser>(`/admin/users/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard-summary"] });
    },
  });
}
