import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource-variable/geist-mono/index.css";
import "./index.css";
import { router } from "./router";
import { ThemeProvider } from "./providers/theme-provider";
import { QueryProvider } from "./providers/query-provider";
import { AuthProvider } from "./providers/auth-provider";
import { useAuth } from "./hooks/use-auth";
import { AppErrorBoundary } from "./components/layout/error-boundary";

function RouterShell() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <RouterProvider router={router} context={{ auth }} />;
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <QueryProvider>
          <AuthProvider>
            <RouterShell />
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
