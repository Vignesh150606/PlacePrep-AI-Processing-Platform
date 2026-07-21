import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DataExport, Settings, SettingsUpdateInput } from "@placeprep/shared";
import { apiDelete, apiGet, apiPatch } from "@/lib/api-client";
import { useAuth } from "./use-auth";

export function useSettings() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["settings", "me"],
    queryFn: () => apiGet<Settings>("/settings/me"),
    enabled: !!session,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsUpdateInput) => apiPatch<Settings>("/settings/me", input),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings", "me"], data);
    },
  });
}

/** Fetches the export payload on demand -- not a background query, this
 * only runs when the person actually clicks "Download my data". */
export function useExportData() {
  return useMutation({
    mutationFn: () => apiGet<DataExport>("/settings/export"),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => apiDelete<null>("/settings/account"),
  });
}
