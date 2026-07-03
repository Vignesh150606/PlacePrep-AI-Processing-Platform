import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Configured here (not just defaulted) because Sprint 1A is mock-data-only —
 * once real API calls land, retry/staleTime should be tuned per-endpoint
 * rather than globally. This client exists now so TanStack Query hooks can
 * be introduced page-by-page without a provider migration later.
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
