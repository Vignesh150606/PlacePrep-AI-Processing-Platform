import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Profile, ProfileUpdateInput } from "@placeprep/shared";
import { apiGet, apiPatch } from "@/lib/api-client";
import { useAuth } from "./use-auth";

export function useProfile() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => apiGet<Profile>("/profiles/me"),
    enabled: !!session,
    staleTime: 5 * 60_000,
  });
}

// NEW (Phase 16): Settings > Account is the first UI in the app that lets
// someone edit their own name/college/department/year -- the endpoint
// (PATCH /profiles/me) already existed, it just never had a client hook.
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProfileUpdateInput) => apiPatch<Profile>("/profiles/me", payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["profile", "me"], data);
    },
  });
}

export function useIsAdmin(): boolean {
  const { data } = useProfile();
  return data?.role === "admin";
}
