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
<<<<<<< HEAD
=======

export type AuditAction =
  | "pdf-approved"
  | "pdf-rejected"
  | "question-approved"
  | "question-rejected"
  | "question-edited"
  | "question-merged"
  | "question-deleted"
  | "interview-experience-approved"
  | "interview-experience-rejected"
  | "interview-experience-edited"
  | "interview-experience-deleted"
  | "user-role-changed";

export type AuditTargetType = "pdf" | "question" | "interview-experience" | "user";

export interface AuditLogEntry {
  id: string;
  adminId: string;
  adminName: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface AuditLogListResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export function useAdminAuditLogs(params: {
  page: number;
  pageSize: number;
  action?: AuditAction;
  targetType?: AuditTargetType;
}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("page_size", String(params.pageSize));
  if (params.action) query.set("action", params.action);
  if (params.targetType) query.set("target_type", params.targetType);

  return useQuery({
    queryKey: ["admin", "audit-logs", params],
    queryFn: () => apiGet<AuditLogListResponse>(`/admin/audit-logs?${query.toString()}`),
    staleTime: 10_000,
  });
}
>>>>>>> 97283c7 (Admin panel)
