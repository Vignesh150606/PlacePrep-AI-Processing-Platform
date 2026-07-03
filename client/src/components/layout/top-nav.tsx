import { MobileNav } from "./mobile-nav";
import { Breadcrumbs } from "./breadcrumbs";
import { SearchBar } from "@/components/ui/search-bar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationCenter } from "./notification-center";
import { ProfileMenu } from "./profile-menu";

export function TopNav() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 lg:px-6">
      <MobileNav />
      <div className="hidden lg:block">
        <Breadcrumbs />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <SearchBar
          placeholder="Search questions, companies..."
          containerClassName="hidden w-64 md:block"
          aria-label="Global search"
        />
        <ThemeToggle />
        <NotificationCenter />
        <ProfileMenu />
      </div>
    </header>
  );
}
