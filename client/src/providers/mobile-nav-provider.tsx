import * as React from "react";
import { MobileNavContext } from "./mobile-nav-context";

// NEW (Phase 14, Part 1 -- Mobile Experience & PWA). `MobileNav`'s drawer
// used to own its open/close state locally, with the hamburger button in
// `TopNav` as its only trigger. The new `BottomTabBar`'s "More" tab needs
// to open that exact same drawer (the full nav tree -- Admin, Community,
// Calendar, Settings, etc. -- is too long to fit as bottom-bar tabs), so
// the open state is lifted here rather than duplicating the drawer. Split
// across context/provider/hook files the same way this codebase's
// existing auth-context.ts / auth-provider.tsx / use-auth.ts already are.
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const value = React.useMemo(() => ({ open, setOpen }), [open]);
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}
