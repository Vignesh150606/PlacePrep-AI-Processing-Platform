import * as React from "react";
import type { Session, UserIdentity } from "@supabase/supabase-js";
import type { AuthUser } from "@/lib/auth-user";

export interface AuthContextValue {
  session: Session | null;
  user: AuthUser | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  // NEW (Phase 16, Settings > Security/Connected Accounts): every
  // Supabase Auth action Settings needs lives here too, same as
  // signInWithGoogle/signOut above -- one place owns `supabase.auth.*`
  // calls rather than importing the client directly into a new file.
  updatePassword: (newPassword: string) => Promise<void>;
  signOutOtherSessions: () => Promise<void>;
  getIdentities: () => Promise<UserIdentity[]>;
  linkGoogleIdentity: () => Promise<void>;
  unlinkIdentity: (identity: UserIdentity) => Promise<void>;
}

export const AuthContext = React.createContext<AuthContextValue | null>(null);
