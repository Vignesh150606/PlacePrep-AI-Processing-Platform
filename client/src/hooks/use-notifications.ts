import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@placeprep/shared";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAuth } from "./use-auth";

interface NotificationListResponse {
  items: Notification[];
  unreadCount: number;
}

export function useNotifications() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiGet<NotificationListResponse>("/notifications"),
    enabled: !!session,
    refetchInterval: session ? 20_000 : false,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => apiPost<null>(`/notifications/${notificationId}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<null>("/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
