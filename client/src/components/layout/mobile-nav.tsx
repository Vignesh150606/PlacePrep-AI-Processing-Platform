import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { GraduationCap, Menu, X } from "lucide-react";
import { NAV_SECTIONS } from "./nav-items";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-profile";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { useMobileNavContext } from "@/hooks/use-mobile-nav-context";

export function MobileNav() {
  // MODIFIED (Phase 14, Part 1): open state lifted into MobileNavProvider
  // so BottomTabBar's "More" tab can open this same drawer -- see that
  // provider's header comment. Behavior for this component is unchanged.
  const { open, setOpen } = useMobileNavContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useIsAdmin();
  // FIX (accessibility, UI audit; retrofitted onto the shared contract in
  // Sprint 1A): this drawer was a hand-rolled overlay with none of the
  // behavior a modal needs — no `role="dialog"`, no Escape-to-close, no
  // focus moved into the panel on open or restored to the trigger on
  // close, and the page behind it stayed scrollable. Originally fixed
  // in-line here; now shares one implementation with the mobile quiz
  // palette sheet via `useDialogA11y` (see that hook's header comment)
  // instead of duplicating the same focus-trap logic in both places.
  const { containerRef: panelRef } = useDialogA11y({ open, onClose: () => setOpen(false) });

  React.useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 animate-fade-in"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            tabIndex={-1}
            className="relative flex h-full w-72 flex-col bg-surface-raised shadow-xl animate-slide-in-left focus-visible:outline-none"
          >
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-md bg-accent-600 text-white">
                  <GraduationCap className="size-4" />
                </div>
                <span className="text-sm font-semibold text-foreground">PlacePrep</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Mobile navigation">
              {visibleSections.map((section) => (
                <div key={section.label} className="mb-5">
                  <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {section.label}
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {section.items.map((item) => {
                      const isActive =
                        item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          <Link
                            to={item.href}
                            aria-current={isActive ? "page" : undefined}
                            className={cn(
                              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                              isActive
                                ? "bg-accent-600/10 text-accent-700 dark:text-accent-400"
                                : "text-muted-foreground hover:bg-surface hover:text-foreground",
                            )}
                          >
                            <Icon className="size-4" />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
