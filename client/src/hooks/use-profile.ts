import { useQuery } from "@tanstack/react-query";
import type { Profile } from "@placeprep/shared";
import { apiGet } from "@/lib/api-client";
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

export function useIsAdmin(): boolean {
  const { data } = useProfile();
  return data?.role === "admin";
}
