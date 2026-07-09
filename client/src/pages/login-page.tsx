import * as React from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.43 3.58v2.98h3.86c2.26-2.09 3.59-5.17 3.59-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-2.98c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.31A7.14 7.14 0 0 1 4.9 12c0-.8.14-1.57.37-2.31V6.6H1.29A11.96 11.96 0 0 0 0 12c0 1.93.46 3.76 1.29 5.4l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.6l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

export function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [isSigningIn, setIsSigningIn] = React.useState(false);

  async function handleGoogleSignIn() {
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      toast.error("Couldn't start Google sign-in. Please try again.");
      setIsSigningIn(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-sm flex-col gap-6 animate-fade-up">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-accent-600 text-white">
            <GraduationCap className="size-5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">PlacePrep</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to continue your placement prep.
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            {/* FIX (consistency, UI audit): this was a hand-rolled <button>
                with its own one-off height (h-10, matching none of the
                Button component's sm/md/lg scale) and duplicated
                disabled-state styling, instead of the shared design-system
                Button used everywhere else in the app. */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="bg-surface-raised"
            >
              {isSigningIn ? <Loader2 className="size-4 animate-spin" /> : <GoogleLogo />}
              Continue with Google
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              By continuing, you agree to use PlacePrep for placement preparation purposes.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
