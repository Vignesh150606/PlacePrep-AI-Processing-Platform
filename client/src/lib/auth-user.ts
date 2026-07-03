import type { User as SupabaseUser } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

const FALLBACK_NAME = "Vignesh M";

export function toAuthUser(user: SupabaseUser | null): AuthUser | null {
  if (!user) return null;

  const metadata = user.user_metadata ?? {};
  const fullName =
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    (typeof metadata.name === "string" && metadata.name) ||
    FALLBACK_NAME;
  const avatarUrl =
    (typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
    (typeof metadata.picture === "string" && metadata.picture) ||
    null;

  return {
    id: user.id,
    email: user.email ?? "",
    fullName,
    avatarUrl,
  };
}
