import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, BookOpenText, ClipboardList, Bookmark, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileNavContext } from "@/hooks/use-mobile-nav-context";

// NEW (Phase 14, Part 1 -- Mobile Experience & PWA). A persistent bottom
// tab bar for the handful of destinations a student returns to constantly
// (Dashboard, Question Bank, Quiz, Bookmarks), following the standard
// mobile-app placement pattern instead of asking every visit to go
// through the hamburger drawer. The drawer (`MobileNav`) still exists and
// still holds the full nav tree -- Companies, Resources, Community,
// Alumni, Calendar, Wrong Answers, Analytics, Notifications, the whole
// Admin section, Settings -- deliberately NOT duplicated as tabs here,
// since fitting all of it would defeat the point of a bottom bar. "More"
// opens that same drawer via `MobileNavContext` rather than a second one.
const TABS = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Questions", href: "/questions", icon: BookOpenText },
  { label: "Quiz", href: "/quiz", icon: ClipboardList },
  { label: "Saved", href: "/bookmarks", icon: Bookmark },
] as const;

export function BottomTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpen } = useMobileNavContext();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface-raised/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => {
        const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            to={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors",
              isActive ? "text-accent-600 dark:text-accent-400" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {tab.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open full navigation menu"
        className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors"
      >
        <Menu className="size-5" />
        More
      </button>
    </nav>
  );
}
