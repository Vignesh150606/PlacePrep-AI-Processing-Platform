import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Profile, UserRole } from "@placeprep/shared";
import { apiGet, apiPatch } from "@/lib/api-client";

export interface AdminDashboardSummary {
  pendingPdfApprovals: number;
  pendingQuestionReviews: number;
  pendingInterviewReviews: number;
  pendingResourceReviews: number;
  pendingAlumniVerifications: number;
  reportedExperienceCount: number;
  reportedCommunityContentCount: number;
  failedProcessingJobs: number;
  totalUsers: number;
  totalAdmins: number;
  /** Phase 15, Part 1 -- Question Lifecycle Management. */
  archivedQuestionCount: number;
  deletedQuestionCount: number;
  /** Phase 15, Part 2 (Slice A) -- Resource Lifecycle Management. */
  archivedResourceCount: number;
  deletedResourceCount: number;
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
  | "user-role-changed"
  | "resource-approved"
  | "resource-rejected"
  | "resource-edited"
  | "resource-deleted"
  | "resource-bulk-approved"
  | "resource-bulk-rejected"
  | "resource-bulk-deleted"
  | "alumni-verified"
  | "alumni-rejected"
  | "alumni-edited"
  | "alumni-suspended"
  | "alumni-verification-removed"
  | "alumni-deleted"
  | "alumni-manual-created"
  // Phase 15, Part 1 -- Question Lifecycle Management.
  | "question-archived"
  | "question-unarchived"
  | "question-restored"
  | "question-permanently-deleted"
  | "question-bulk-updated"
  | "question-bulk-approved"
  | "question-bulk-rejected"
  | "question-bulk-published"
  | "question-bulk-archived"
  | "question-bulk-unarchived"
  | "question-bulk-restored"
  | "question-bulk-deleted"
  | "question-bulk-permanently-deleted"
  // Phase 15, Part 2 (Slice A) -- Resource Lifecycle Management.
  | "resource-archived"
  | "resource-unarchived"
  | "resource-restored"
  | "resource-permanently-deleted"
  | "resource-bulk-updated"
  | "resource-bulk-archived"
  | "resource-bulk-unarchived"
  | "resource-bulk-restored"
  | "resource-bulk-permanently-deleted";

export type AuditTargetType = "pdf" | "question" | "interview-experience" | "user" | "resource" | "alumni";

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
