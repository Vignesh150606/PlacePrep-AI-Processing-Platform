import * as React from "react";
import { MobileNavContext } from "@/providers/mobile-nav-context";

export function useMobileNavContext() {
  const context = React.useContext(MobileNavContext);
  if (!context) {
    throw new Error("useMobileNavContext must be used within a MobileNavProvider");
  }
  return context;
}
