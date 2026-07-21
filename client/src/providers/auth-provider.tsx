import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { toAuthUser } from "@/lib/auth-user";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = React.useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const signOut = React.useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // NEW (Phase 16) --------------------------------------------------------
  const updatePassword = React.useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, []);

  const signOutOtherSessions = React.useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) throw error;
  }, []);

  const getIdentities = React.useCallback(async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) throw error;
    return data.identities;
  }, []);

  const linkGoogleIdentity = React.useCallback(async () => {
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const unlinkIdentity = React.useCallback(async (identity: Parameters<typeof supabase.auth.unlinkIdentity>[0]) => {
    const { error } = await supabase.auth.unlinkIdentity(identity);
    if (error) throw error;
  }, []);
  // ------------------------------------------------------------------------

  const value = React.useMemo(
    () => ({
      session,
      user: toAuthUser(session?.user ?? null),
      isLoading,
      signInWithGoogle,
      signOut,
      updatePassword,
      signOutOtherSessions,
      getIdentities,
      linkGoogleIdentity,
      unlinkIdentity,
    }),
    [
      session,
      isLoading,
      signInWithGoogle,
      signOut,
      updatePassword,
      signOutOtherSessions,
      getIdentities,
      linkGoogleIdentity,
      unlinkIdentity,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
