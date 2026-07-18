import { Outlet } from "@tanstack/react-router";
import * as React from "react";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { Toaster } from "sonner";
import { BottomTabBar } from "./bottom-tab-bar";
import { RouteLoadingFallback } from "./route-loading-fallback";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { MobileNavProvider } from "@/providers/mobile-nav-provider";

export function AppLayout() {
  return (
    <MobileNavProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <OfflineBanner />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopNav />
            {/* MODIFIED (Phase 14, Part 1): bottom padding on mobile clears the
                new fixed BottomTabBar (~52px + safe-area) instead of content
                running under it; unchanged on desktop (lg:), which has no
                bottom bar. */}
            <main className="flex-1 overflow-y-auto px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-6 lg:px-8 lg:py-8">
              <div className="mx-auto w-full max-w-6xl animate-fade-in">
                <React.Suspense fallback={<RouteLoadingFallback />}>
                  <Outlet />
                </React.Suspense>
              </div>
            </main>
          </div>
        </div>
        <BottomTabBar />
        <InstallPrompt />
        <Toaster position="bottom-right" richColors closeButton />
      </div>
    </MobileNavProvider>
  );
}
