import { useQuery } from "@tanstack/react-query";
import type { ProcessingDashboardStats, ProcessingJob } from "@placeprep/shared";
import { apiGet } from "@/lib/api-client";

interface JobListResponse {
  items: ProcessingJob[];
}

export function useProcessingDashboard(enabled: boolean) {
  return useQuery({
    queryKey: ["processing", "dashboard"],
    queryFn: () => apiGet<ProcessingDashboardStats>("/processing/dashboard"),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}

export function useProcessingJobs(enabled: boolean) {
  return useQuery({
    queryKey: ["processing", "jobs"],
    queryFn: () => apiGet<JobListResponse>("/processing/jobs"),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}
