import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import type { AuthUser } from "@/lib/auth-user";

export interface AuthContextValue {
  session: Session | null;
  user: AuthUser | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = React.createContext<AuthContextValue | null>(null);
