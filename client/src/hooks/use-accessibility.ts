import * as React from "react";
import { AccessibilityContext } from "@/providers/accessibility-context";

export function useAccessibility() {
  const ctx = React.useContext(AccessibilityContext);
  if (!ctx) throw new Error("useAccessibility must be used within AccessibilityProvider");
  return ctx;
}
