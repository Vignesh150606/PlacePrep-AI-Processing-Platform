import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CalendarEvent, CalendarEventStatus } from "@placeprep/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";

interface CalendarEventListResponse {
  items: CalendarEvent[];
}

export interface PlacementEventFilters {
  companyId?: string;
  status?: CalendarEventStatus;
  /** YYYY-MM */
  month?: string;
}

function buildQuery(filters: PlacementEventFilters): string {
  const params = new URLSearchParams();
  if (filters.companyId) params.set("company_id", filters.companyId);
  if (filters.status) params.set("status", filters.status);
  if (filters.month) params.set("month", filters.month);
  const qs = params.toString();
  return qs ? `/calendar?${qs}` : "/calendar";
}

export function usePlacementEvents(filters: PlacementEventFilters = {}) {
  return useQuery({
    queryKey: ["calendar-events", filters],
    queryFn: () => apiGet<CalendarEventListResponse>(buildQuery(filters)),
    staleTime: 30_000,
  });
}

export type PlacementEventInput = Omit<CalendarEvent, "id" | "createdById" | "updatedAt">;

export function useCreatePlacementEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlacementEventInput) => apiPost<CalendarEvent>("/calendar", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}

export function useUpdatePlacementEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<PlacementEventInput>) =>
      apiPatch<CalendarEvent>(`/calendar/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}

export function useDeletePlacementEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<null>(`/calendar/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}
