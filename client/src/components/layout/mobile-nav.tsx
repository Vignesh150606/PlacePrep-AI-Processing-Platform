import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { GraduationCap, Menu, X } from "lucide-react";
import { NAV_SECTIONS } from "./nav-items";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-profile";

export function MobileNav() {
  const [open, setOpen] = React.useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useIsAdmin();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // FIX (accessibility, UI audit): this drawer was a hand-rolled overlay
  // with none of the behavior a modal needs — no `role="dialog"`, no
  // Escape-to-close, no focus moved into the panel on open or restored to
  // the trigger on close, and the page behind it stayed scrollable. The
  // desktop Sidebar also marks the active link with `aria-current="page"`;
  // this panel didn't. All fixed below, matching Radix's own dialog
  // pattern (used elsewhere in the app) without pulling in a new
  // dependency for a simple slide-in panel.
  React.useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    const trigger = triggerRef.current;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      trigger?.focus();
    };
  }, [open]);

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="lg:hidden">
      <Button
        ref={triggerRef}
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
            className="relative flex h-full w-72 flex-col bg-surface-raised shadow-xl animate-slide-in-left"
          >
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-md bg-accent-600 text-white">
                  <GraduationCap className="size-4" />
                </div>
                <span className="text-sm font-semibold text-foreground">PlacePrep</span>
              </div>
              <Button
                ref={closeRef}
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
