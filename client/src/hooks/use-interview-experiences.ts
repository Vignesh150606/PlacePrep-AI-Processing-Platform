import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InterviewExperience, ModerationStatus } from "@placeprep/shared";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api-client";

interface ExperienceListResponse {
  items: InterviewExperience[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExperienceFilters {
  companyId?: string;
  role?: string;
  difficulty?: string;
  graduationYear?: number;
  department?: string;
  roundType?: string;
  status?: ModerationStatus;
  page?: number;
}

function buildQuery(filters: ExperienceFilters): string {
  const params = new URLSearchParams();
  if (filters.companyId) params.set("company_id", filters.companyId);
  if (filters.role) params.set("role", filters.role);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.graduationYear) params.set("graduation_year", String(filters.graduationYear));
  if (filters.department) params.set("department", filters.department);
  if (filters.roundType) params.set("round_type", filters.roundType);
  if (filters.status) params.set("status", filters.status);
  if (filters.page) params.set("page", String(filters.page));
  const qs = params.toString();
  return qs ? `/interview-experiences?${qs}` : "/interview-experiences";
}

export function useInterviewExperiences(filters: ExperienceFilters = {}) {
  return useQuery({
    queryKey: ["interview-experiences", filters],
    queryFn: () => apiGet<ExperienceListResponse>(buildQuery(filters)),
    staleTime: 30_000,
  });
}

export function useInterviewExperience(id: string | undefined) {
  return useQuery({
    queryKey: ["interview-experiences", "detail", id],
    queryFn: () => apiGet<InterviewExperience>(`/interview-experiences/${id}`),
    enabled: !!id,
  });
}

export type ExperienceSubmission = Omit<
  InterviewExperience,
  | "id"
  | "authorId"
  | "status"
  | "upvoteCount"
  | "notHelpfulCount"
  | "reportCount"
  | "myVote"
  | "isPinned"
  | "rejectionReason"
  | "createdAt"
  | "updatedAt"
>;

function invalidateExperiences(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["interview-experiences"] });
}

export function useCreateExperience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExperienceSubmission) => apiPost<InterviewExperience>("/interview-experiences", input),
    onSuccess: () => invalidateExperiences(queryClient),
  });
}

export function useUpdateExperienceStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, rejectionReason }: { id: string; status: "approved" | "rejected"; rejectionReason?: string }) =>
      apiPatch<InterviewExperience>(`/interview-experiences/${id}/status`, { status, rejectionReason }),
    onSuccess: () => invalidateExperiences(queryClient),
  });
}

export function useUpdateExperience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<ExperienceSubmission>) =>
      apiPatch<InterviewExperience>(`/interview-experiences/${id}`, patch),
    onSuccess: () => invalidateExperiences(queryClient),
  });
}

export function useDeleteExperience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<null>(`/interview-experiences/${id}`),
    onSuccess: () => invalidateExperiences(queryClient),
  });
}

export function useVoteExperience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, voteType }: { id: string; voteType: "helpful" | "not-helpful" }) =>
      apiPost<{ helpful: number; "not-helpful": number }>(`/interview-experiences/${id}/vote`, { voteType }),
    onSuccess: () => invalidateExperiences(queryClient),
  });
}

export function useReportExperience() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiPost<null>(`/interview-experiences/${id}/report`, { reason }),
  });
}
