import * as React from "react";
import { Search } from "lucide-react";
import { MobileNav } from "./mobile-nav";
import { Breadcrumbs } from "./breadcrumbs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationCenter } from "./notification-center";
import { ProfileMenu } from "./profile-menu";
import { CommandPalette } from "@/components/search/command-palette";

export function TopNav() {
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  // NEW (Sprint 1A): global ⌘K / Ctrl+K to open the command palette. Ignores
  // the shortcut while focus is already in a text-entry element so it
  // doesn't hijack typing (e.g. a "k" inside some other input).
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isShortcut) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      if (isTyping && !paletteOpen) return;

      event.preventDefault();
      setPaletteOpen((open) => !open);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [paletteOpen]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 lg:px-6">
      <MobileNav />
      <div className="hidden lg:block">
        <Breadcrumbs />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* FIX (Sprint 1A): was a decorative SearchBar with no onChange/handler
            of any kind — now opens the real command palette. */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search questions, companies, PDFs"
          className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 text-sm text-muted-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background md:flex"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="rounded border border-border-subtle px-1.5 py-0.5 text-[11px]">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search questions, companies, PDFs"
          className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          <Search className="size-4" />
        </button>
        <ThemeToggle />
        <NotificationCenter />
        <ProfileMenu />
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
